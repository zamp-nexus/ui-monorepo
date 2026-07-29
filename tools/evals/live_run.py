"""Drive one real investigation end to end.

Builds the same graph the API composition root builds, but seeds a tenant
directly and calls the service with a hand-made actor, so no Clerk setup is
needed. Everything downstream of that — agents, routing, Cube, the confidence
gate, agent_executions, the ClickHouse ledger — is the real thing.

    uv run python tools/evals/live_run.py --replay free_tier
    uv run python tools/evals/live_run.py --record free_tier
    uv run python tools/evals/live_run.py --record premium_tier --tier premium

`--replay` costs nothing and touches no provider: it serves a cassette under
`evals/cassettes/` recorded by an earlier `--record` run, so a calibration or
gating change can be re-verified against real model output for free. Anything
the cassette does not hold raises rather than silently reaching the network.

The tier defaults to `free` and a bare run calls live models, so spending money
is always something you typed on purpose.

Reads provider keys from the environment or apps/api/.env. Never prints them.
"""

from __future__ import annotations

import argparse
import asyncio
import os
from datetime import UTC, datetime
from pathlib import Path
from uuid import UUID, uuid4

from sqlalchemy import insert, select, text
from sqlalchemy.ext.asyncio import create_async_engine
from zentra_adapter_clickhouse import AuditRepository
from zentra_adapter_cube import CubeClient, CubeSemanticLayer
from zentra_adapter_langgraph import (
    EvaluatorAgent,
    InvestigationGraph,
    OrchestratorAgent,
    SqlAnalystAgent,
)
from zentra_adapter_model_providers import (
    ModelTier,
    ProviderCircuitBreaker,
    ProviderClients,
    RecordingModelClient,
    ReplayModelClient,
    RoutedModelClient,
    chain_for,
)
from zentra_adapter_postgres import Database, PostgresInvestigationUnitOfWorkFactory
from zentra_adapter_postgres.schema import (
    agent_registry,
    tenant_memberships,
    tenants,
    users,
)
from zentra_api.audit_delivery import AuditDeliveryCoordinator
from zentra_api.pipeline import (
    LangGraphInvestigationPipeline,
    PostgresExecutionRecorder,
)
from zentra_api.registry import PostgresAgentRegistry
from zentra_api.settings import Settings
from zentra_application_investigation import (
    AuthenticatedActor,
    InvestigationService,
    Role,
)
from zentra_domain_agent_execution import AgentRole, ModelPort

CASSETTE_ROOT = Path(__file__).resolve().parents[2] / "evals" / "cassettes"

OWNER_URL = os.environ.get(
    "DATABASE_OWNER_URL",
    "postgresql+psycopg://zentra_owner:zentra_owner@localhost:5432/zentra_control",
)
RUNTIME_URL = os.environ.get(
    "DATABASE_URL",
    "postgresql+psycopg://zentra_app:zentra_app@localhost:5432/zentra_control",
)


async def seed_tenant(tier: str) -> tuple[UUID, UUID]:
    """A tenant, a user, and an owner membership. Idempotent per run."""
    tenant_id, user_id = uuid4(), uuid4()
    engine = create_async_engine(OWNER_URL)
    async with engine.begin() as connection:
        await connection.execute(
            insert(tenants).values(
                tenant_id=tenant_id,
                name=f"Live run ({tier})",
                model_tier=tier,
            )
        )
        await connection.execute(
            insert(users).values(user_id=user_id, email=f"{user_id}@live.test")
        )
        await connection.execute(
            insert(tenant_memberships).values(tenant_id=tenant_id, user_id=user_id, role="owner")
        )
        enabled = (
            (
                await connection.execute(
                    select(agent_registry.c.agent_id).where(agent_registry.c.enabled.is_(True))
                )
            )
            .scalars()
            .all()
        )
    await engine.dispose()
    if len(enabled) < 3:
        raise SystemExit(
            f"Only {len(enabled)} agents enabled. Run:\n"
            "  DATABASE_OWNER_URL=... npx nx run evals:promote"
        )
    return tenant_id, user_id


def build(
    settings: Settings,
    tier: ModelTier,
    database: Database,
    *,
    record: str | None,
    replay: str | None,
) -> tuple[InvestigationService, ProviderClients, AuditRepository]:
    models = ProviderClients.from_keys(settings.provider_api_keys())

    if replay is not None:
        # Wrapped outside the router on purpose: the cassette records which
        # model actually served, so replay reproduces the served identities the
        # independence check reads — without a single provider call.
        directory = CASSETTE_ROOT / replay
        replayer = ReplayModelClient(directory)
        print(f"tier: {tier.value}  replaying {replayer.recorded} calls\n")
        service, audit = _assemble(settings, tier, database, replayer)
        return service, models, audit

    print(f"providers configured: {sorted(p.value for p in models.available)}")
    print(f"tier: {tier.value}")
    for role in (AgentRole.ORCHESTRATOR, AgentRole.SQL_ANALYST, AgentRole.EVALUATOR):
        chain = " -> ".join(str(c) for c in chain_for(tier, role))
        reachable = [c for c in chain_for(tier, role) if c.provider in models.available]
        print(f"  {role.value:14s} {chain}")
        if not reachable:
            raise SystemExit(f"No provider key for any rung of {role.value}")
    print()

    model: ModelPort = RoutedModelClient(
        tier=tier, clients=models.as_dict(), breaker=ProviderCircuitBreaker()
    )
    if record is not None:
        model = RecordingModelClient(model, CASSETTE_ROOT / record)
        print(f"recording to {CASSETTE_ROOT / record}\n")
    service, audit = _assemble(settings, tier, database, model)
    return service, models, audit


def _assemble(
    settings: Settings,
    tier: ModelTier,
    database: Database,
    model: ModelPort,
) -> tuple[InvestigationService, AuditRepository]:
    """Everything below the model seam, identical whichever client is above it."""
    cube = CubeClient(settings.cube_url, settings.cube_api_secret)
    semantic_layer = CubeSemanticLayer(cube)
    uow = PostgresInvestigationUnitOfWorkFactory(database)
    graph = InvestigationGraph(
        orchestrator=OrchestratorAgent(model=model, registry=PostgresAgentRegistry(database)),
        sql_analyst=SqlAnalystAgent(model=model, semantic_layer=semantic_layer),
        evaluator=EvaluatorAgent(model=model, semantic_layer=semantic_layer),
        recorder=PostgresExecutionRecorder(uow),
    )
    audit = AuditRepository.connect(
        host=settings.clickhouse_host,
        port=settings.clickhouse_port,
        username=settings.clickhouse_username,
        password=settings.clickhouse_password,
        database=settings.clickhouse_database,
        secure=settings.clickhouse_secure,
    )
    delivery = AuditDeliveryCoordinator(unit_of_work_factory=uow, audit=audit)
    service = InvestigationService(
        unit_of_work_factory=uow,
        pipeline=LangGraphInvestigationPipeline({tier: graph}),
        audit_writer=delivery,
        audit_reader=delivery,
        now=lambda: datetime.now(UTC),
        new_id=uuid4,
    )
    return service, audit


async def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--tier",
        choices=["free", "premium"],
        default="free",
        help="Defaults to free so premium spend is always deliberate.",
    )
    group = parser.add_mutually_exclusive_group()
    group.add_argument("--record", metavar="NAME", help="Save responses as a cassette.")
    group.add_argument("--replay", metavar="NAME", help="Serve a cassette. Costs $0.")
    args = parser.parse_args()

    settings = Settings(_env_file="apps/api/.env")
    tier = ModelTier(args.tier)
    tenant_id, user_id = await seed_tenant(args.tier)

    database = Database(RUNTIME_URL)
    service, models, audit = build(settings, tier, database, record=args.record, replay=args.replay)
    actor = AuthenticatedActor(
        user_id=user_id,
        tenant_id=tenant_id,
        role=Role.OWNER,
        trace_id=uuid4(),
        span_id=uuid4(),
    )

    started = datetime.now(UTC)
    detail = await service.start(actor, scenario_key="eu_refund_spike")
    print(f"started  {detail.investigation_id}  status={detail.status.value}")
    print("running the agents (this takes minutes on the free tier)...\n")

    try:
        await service.execute(actor, detail.investigation_id)
    finally:
        elapsed = (datetime.now(UTC) - started).total_seconds()

    detail = await service.get(actor, detail.investigation_id)

    print(f"=== {detail.status.value}  in {elapsed:.0f}s ===")
    if detail.outcome is not None:
        print(f"outcome: {detail.outcome.model_dump()}")
    if detail.pending_approval is not None:
        print(f"gate:    {detail.pending_approval.reason}")
    if detail.finding is not None:
        print(f"\nheadline: {detail.finding.headline}")
        print(f"summary:  {detail.finding.summary}")
        for metric in detail.finding.metrics:
            print(
                f"  {metric.metric}: {metric.previous_value} -> "
                f"{metric.current_value} {metric.unit}"
            )

    print("\n=== which model served each step ===")
    engine = create_async_engine(OWNER_URL)
    async with engine.begin() as connection:
        rows = (
            await connection.execute(
                text(
                    "SELECT step, agent_id, model, status, confidence, "
                    "latency_ms, cost_usd FROM agent_executions "
                    "WHERE investigation_id = :i ORDER BY step"
                ),
                {"i": detail.investigation_id},
            )
        ).all()
    await engine.dispose()
    for row in rows:
        print(
            f"  {row.step}. {row.agent_id:18s} {str(row.model):34s} "
            f"{row.status:8s} conf={row.confidence} {row.latency_ms}ms "
            f"${row.cost_usd}"
        )

    print("\n=== ledger timeline ===")
    for entry in detail.timeline:
        label = entry.model or entry.event_type
        print(f"  {entry.created_at:%H:%M:%S}  {label}  [{entry.delivery.value}]")

    await models.close()
    await audit.close()
    await database.close()
    return 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
