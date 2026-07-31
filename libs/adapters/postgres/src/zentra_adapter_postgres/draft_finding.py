"""Draft Finding persistence.

Its own module rather than another section of `investigation.py`, which is
already near the repository's 600-line limit.

Two tables, not a JSON blob on the Investigation, because claim order and the
observed/interpretation split have to survive as *queryable structure* — the
publication policy will read them, and Replay has to render them. A blob would
have made both a parsing exercise.
"""

from __future__ import annotations

from decimal import Decimal
from uuid import UUID

from sqlalchemy import insert, select
from sqlalchemy.ext.asyncio import AsyncConnection
from zentra_domain_agent_execution import ConfidenceOutcome
from zentra_domain_investigation import (
    Claim,
    ClaimKind,
    Contradiction,
    DraftFinding,
    RootCauseState,
)

from .schema import draft_finding_claims, draft_findings


class PostgresDraftFindingRepository:
    """Tenant-scoped like every other repository here: the connection carries
    `app.tenant_id`, and RLS is what makes a cross-Tenant read return nothing
    rather than raise.
    """

    def __init__(self, connection: AsyncConnection) -> None:
        self._connection = connection

    async def add(self, draft: DraftFinding) -> None:
        confidence = draft.confidence
        await self._connection.execute(
            insert(draft_findings).values(
                draft_finding_id=draft.draft_finding_id,
                investigation_id=draft.investigation_id,
                tenant_id=draft.tenant_id,
                version=draft.version,
                produced_by_execution_id=draft.produced_by_execution_id,
                headline=draft.headline,
                summary=draft.summary,
                contradictions=[
                    {"detail": c.detail, "resolved": c.resolved}
                    for c in draft.contradictions
                ],
                root_cause=draft.root_cause.value,
                confidence=(
                    Decimal(str(confidence.score)) if confidence else None
                ),
                confidence_method=(
                    confidence.calibration_method if confidence else None
                ),
                created_at=draft.created_at,
            )
        )
        if not draft.claims:
            return
        await self._connection.execute(
            insert(draft_finding_claims),
            [
                {
                    "claim_id": claim.claim_id,
                    "draft_finding_id": draft.draft_finding_id,
                    "tenant_id": draft.tenant_id,
                    "kind": claim.kind.value,
                    "claim_text": claim.text,
                    "metric": claim.metric,
                    "claim_value": claim.value,
                    "period": claim.period,
                    "position": claim.position,
                    "citation_ids": [str(cid) for cid in claim.citation_ids],
                }
                for claim in draft.claims
            ],
        )

    async def latest_for_investigation(
        self,
        investigation_id: UUID,
    ) -> DraftFinding | None:
        """The current draft, which is the highest version.

        An Investigation can be evaluated up to three times, so it can hold
        more than one. Returning the latest is what makes a refresh show the
        same conclusion the reader saw, rather than the first attempt's.
        """
        row = (
            await self._connection.execute(
                select(draft_findings)
                .where(draft_findings.c.investigation_id == investigation_id)
                .order_by(draft_findings.c.version.desc())
                .limit(1)
            )
        ).one_or_none()
        if row is None:
            return None

        claim_rows = (
            await self._connection.execute(
                select(draft_finding_claims)
                .where(
                    draft_finding_claims.c.draft_finding_id
                    == row.draft_finding_id
                )
                .order_by(draft_finding_claims.c.position)
            )
        ).all()

        return DraftFinding(
            draft_finding_id=row.draft_finding_id,
            tenant_id=row.tenant_id,
            investigation_id=row.investigation_id,
            version=row.version,
            created_at=row.created_at,
            produced_by_execution_id=row.produced_by_execution_id,
            headline=row.headline,
            summary=row.summary,
            claims=tuple(
                Claim(
                    claim_id=claim.claim_id,
                    kind=ClaimKind(claim.kind),
                    text=claim.claim_text,
                    position=claim.position,
                    metric=claim.metric,
                    value=claim.claim_value,
                    period=claim.period,
                    citation_ids=tuple(
                        UUID(cid) for cid in (claim.citation_ids or [])
                    ),
                )
                for claim in claim_rows
            ),
            contradictions=tuple(
                Contradiction(
                    detail=entry["detail"],
                    resolved=entry.get("resolved", False),
                )
                for entry in (row.contradictions or [])
            ),
            root_cause=RootCauseState(row.root_cause),
            confidence=(
                ConfidenceOutcome(
                    score=float(row.confidence),
                    calibration_method=row.confidence_method,
                )
                if row.confidence is not None
                else None
            ),
        )
