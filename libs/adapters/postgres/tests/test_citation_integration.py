"""Evidence Citation persistence against a real Postgres.

Three guarantees only a real database can show: the claim-to-citation link
survives with its order, another Tenant cannot reach a citation, and a citation
shared by two claims is stored once.
"""

from __future__ import annotations

import os
from datetime import UTC, datetime
from uuid import UUID, uuid4

import pytest
from sqlalchemy import func, select
from sqlalchemy.dialects.postgresql import insert as postgres_insert
from sqlalchemy.exc import DBAPIError
from sqlalchemy.ext.asyncio import create_async_engine
from zentra_domain_agent_execution import ConfidenceOutcome
from zentra_domain_investigation import (
    CitationFilter,
    CitationState,
    Claim,
    ClaimKind,
    DraftFinding,
    EvidenceCitation,
    RootCauseState,
)

from zentra_adapter_postgres.database import set_tenant_context
from zentra_adapter_postgres.draft_finding import (
    PostgresDraftFindingRepository,
    PostgresEvidenceCitationRepository,
)
from zentra_adapter_postgres.schema import (
    draft_findings,
    evidence_citations,
    investigations,
    tenants,
)

OWNER_URL = os.getenv("TEST_DATABASE_OWNER_URL")
RUNTIME_URL = os.getenv("TEST_DATABASE_RUNTIME_URL")

pytestmark = pytest.mark.skipif(
    not OWNER_URL or not RUNTIME_URL,
    reason="local Postgres integration URLs are not configured",
)

TENANT_A = UUID("85000000-0000-0000-0000-000000000001")
TENANT_B = UUID("85000000-0000-0000-0000-000000000002")
INVESTIGATION = UUID("86000000-0000-0000-0000-000000000001")
JULY = UUID("87000000-0000-0000-0000-000000000001")
JUNE = UUID("87000000-0000-0000-0000-000000000002")
NOW = datetime(2026, 7, 30, 12, 0, tzinfo=UTC)


async def seed() -> None:
    owner = create_async_engine(OWNER_URL)
    async with owner.begin() as connection:
        await connection.execute(
            postgres_insert(tenants)
            .values(
                [
                    {"tenant_id": TENANT_A, "name": "Citation A"},
                    {"tenant_id": TENANT_B, "name": "Citation B"},
                ]
            )
            .on_conflict_do_nothing()
        )
        await connection.execute(
            postgres_insert(investigations)
            .values(
                investigation_id=INVESTIGATION,
                tenant_id=TENANT_A,
                question="Why did EU refunds increase?",
                status="completed",
            )
            .on_conflict_do_nothing()
        )
    await owner.dispose()


async def cleanup() -> None:
    owner = create_async_engine(OWNER_URL)
    async with owner.begin() as connection:
        await connection.execute(
            draft_findings.delete().where(
                draft_findings.c.investigation_id == INVESTIGATION
            )
        )
        await connection.execute(
            evidence_citations.delete().where(
                evidence_citations.c.investigation_id == INVESTIGATION
            )
        )
    await owner.dispose()


def citation(citation_id: UUID, period: str, value: str) -> EvidenceCitation:
    return EvidenceCitation(
        citation_id=citation_id,
        tenant_id=TENANT_A,
        investigation_id=INVESTIGATION,
        metric="refund_amount",
        filters=(
            CitationFilter(
                member="Commerce.region", operator="equals", values=("EU",)
            ),
        ),
        period=period,
        grain="month",
        producing_execution_id=None,
        aggregate_value=value,
        evaluator_outcome=ConfidenceOutcome(
            score=0.82, calibration_method="evaluator_independent_recheck"
        ),
        state=CitationState.ACTIVE,
    )


def draft(claims: tuple[Claim, ...]) -> DraftFinding:
    return DraftFinding(
        draft_finding_id=uuid4(),
        tenant_id=TENANT_A,
        investigation_id=INVESTIGATION,
        version=1,
        created_at=NOW,
        produced_by_execution_id=None,
        headline="EU refunds rose $240 in July.",
        summary="Governed EU refund amount rose from $20 to $260.",
        claims=claims,
        contradictions=(),
        root_cause=RootCauseState.UNRESOLVED,
        confidence=None,
    )


def observed(position: int, citations: tuple[UUID, ...], period: str) -> Claim:
    return Claim(
        claim_id=uuid4(),
        kind=ClaimKind.OBSERVED,
        text=f"Measured claim {position}.",
        position=position,
        metric="refund_amount",
        value="260.00",
        period=period,
        citation_ids=citations,
    )


@pytest.mark.asyncio
async def test_a_claim_keeps_the_order_of_the_evidence_it_cites() -> None:
    """A claim comparing two periods rests on two measurements, and which came
    first is part of what the claim says."""
    await seed()
    await cleanup()
    runtime = create_async_engine(RUNTIME_URL)
    try:
        async with runtime.begin() as connection:
            await set_tenant_context(connection, TENANT_A)
            await PostgresEvidenceCitationRepository(connection).add(
                [
                    citation(JULY, "July 2026", "260.00"),
                    citation(JUNE, "June 2026", "20.00"),
                ]
            )
            await PostgresDraftFindingRepository(connection).add(
                draft((observed(0, (JUNE, JULY), "July 2026"),))
            )

        async with runtime.begin() as connection:
            await set_tenant_context(connection, TENANT_A)
            loaded = await PostgresDraftFindingRepository(
                connection
            ).latest_for_investigation(INVESTIGATION)

        assert loaded is not None
        assert loaded.claims[0].citation_ids == (JUNE, JULY)
    finally:
        await runtime.dispose()
        await cleanup()


@pytest.mark.asyncio
async def test_two_claims_share_one_stored_citation() -> None:
    await seed()
    await cleanup()
    runtime = create_async_engine(RUNTIME_URL)
    try:
        async with runtime.begin() as connection:
            await set_tenant_context(connection, TENANT_A)
            await PostgresEvidenceCitationRepository(connection).add(
                [citation(JULY, "July 2026", "260.00")]
            )
            await PostgresDraftFindingRepository(connection).add(
                draft(
                    (
                        observed(0, (JULY,), "July 2026"),
                        observed(1, (JULY,), "July 2026"),
                    )
                )
            )

        async with runtime.begin() as connection:
            await set_tenant_context(connection, TENANT_A)
            stored = await connection.scalar(
                select(func.count()).select_from(evidence_citations)
            )
            loaded = await PostgresDraftFindingRepository(
                connection
            ).latest_for_investigation(INVESTIGATION)

        assert stored == 1
        assert loaded.claims[0].citation_ids == loaded.claims[1].citation_ids
    finally:
        await runtime.dispose()
        await cleanup()


@pytest.mark.asyncio
async def test_another_tenant_cannot_read_or_plant_a_citation() -> None:
    await seed()
    await cleanup()
    runtime = create_async_engine(RUNTIME_URL)
    try:
        async with runtime.begin() as connection:
            await set_tenant_context(connection, TENANT_A)
            await PostgresEvidenceCitationRepository(connection).add(
                [citation(JULY, "July 2026", "260.00")]
            )

        async with runtime.begin() as connection:
            await set_tenant_context(connection, TENANT_B)
            visible = await PostgresEvidenceCitationRepository(
                connection
            ).for_investigation(INVESTIGATION)
        assert visible == ()

        # And the WITH CHECK half: B cannot write one owned by A.
        with pytest.raises(DBAPIError):
            async with runtime.begin() as connection:
                await set_tenant_context(connection, TENANT_B)
                await PostgresEvidenceCitationRepository(connection).add(
                    [citation(uuid4(), "July 2026", "260.00")]
                )
    finally:
        await runtime.dispose()
        await cleanup()


@pytest.mark.asyncio
async def test_a_citation_round_trips_its_governed_context() -> None:
    await seed()
    await cleanup()
    runtime = create_async_engine(RUNTIME_URL)
    try:
        async with runtime.begin() as connection:
            await set_tenant_context(connection, TENANT_A)
            await PostgresEvidenceCitationRepository(connection).add(
                [citation(JULY, "July 2026", "260.00")]
            )

        async with runtime.begin() as connection:
            await set_tenant_context(connection, TENANT_A)
            loaded = await PostgresEvidenceCitationRepository(
                connection
            ).for_investigation(INVESTIGATION)

        stored = loaded[0]
        assert stored.metric == "refund_amount"
        assert stored.grain == "month"
        assert stored.period == "July 2026"
        assert stored.aggregate_value == "260.00"
        assert stored.filters[0].member == "Commerce.region"
        assert stored.filters[0].values == ("EU",)
        assert stored.evaluator_outcome is not None
        assert stored.state is CitationState.ACTIVE
    finally:
        await runtime.dispose()
        await cleanup()


@pytest.mark.asyncio
async def test_no_prohibited_payload_reaches_a_stored_citation() -> None:
    """Whatever a citation grows into, it must never become somewhere raw rows,
    prompts, credentials or hidden reasoning can live. Asserted against the
    stored columns, which is what a future field would actually widen."""
    from sqlalchemy import inspect as sa_inspect

    owner = create_async_engine(OWNER_URL)
    try:
        async with owner.connect() as connection:
            columns = await connection.run_sync(
                lambda sync: {
                    c["name"]
                    for c in sa_inspect(sync).get_columns("evidence_citations")
                }
            )
    finally:
        await owner.dispose()

    for prohibited in (
        "rows",
        "raw_rows",
        "prompt",
        "system_prompt",
        "reasoning",
        "credential",
        "api_key",
        "secret",
        "token",
    ):
        assert prohibited not in columns, f"{prohibited} became a citation column"
