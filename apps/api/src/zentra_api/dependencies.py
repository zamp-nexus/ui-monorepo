from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Protocol
from uuid import uuid4

from zentra_adapter_clickhouse import AuditRepository
from zentra_adapter_cube import CubeClient, CubeSemanticLayer
from zentra_adapter_langgraph import (
    EvaluatorAgent,
    InsightAgent,
    InvestigationGraph,
    OrchestratorAgent,
    SqlAnalystAgent,
)
from zentra_adapter_langgraph.agents.orchestrator import REQUIRED_ROLES
from zentra_adapter_model_providers import (
    ModelTier,
    ProviderCircuitBreaker,
    ProviderClients,
    RoutedModelClient,
)
from zentra_adapter_postgres import (
    Database,
    PostgresInvestigationUnitOfWorkFactory,
    PostgresOrganizationUnitOfWorkFactory,
    PostgresThreadUnitOfWorkFactory,
)
from zentra_adapter_telemetry import (
    record_evidence_deletion,
    record_publication_decision,
)
from zentra_application_investigation import (
    InvestigationService,
    OrganizationService,
    ThreadService,
)
from zentra_domain_agent_execution import AgentRole

from .audit_delivery import AuditDeliveryCoordinator
from .auth import ClerkJwtVerifier
from .pipeline import (
    LangGraphInvestigationPipeline,
    PostgresExecutionRecorder,
)
from .registry import PostgresAgentRegistry
from .settings import Settings


class HealthProbe(Protocol):
    async def health(self) -> bool: ...


@dataclass(slots=True)
class AppDependencies:
    database: Database
    audit: AuditRepository
    cube: CubeClient
    models: ProviderClients
    jwt_verifier: ClerkJwtVerifier
    investigations: InvestigationService
    audit_delivery: AuditDeliveryCoordinator
    organization: OrganizationService
    threads: ThreadService

    @classmethod
    def from_settings(cls, settings: Settings) -> AppDependencies:
        database = Database(settings.database_url)
        audit = AuditRepository.connect(
            host=settings.clickhouse_host,
            port=settings.clickhouse_port,
            username=settings.clickhouse_username,
            password=settings.clickhouse_password,
            database=settings.clickhouse_database,
            secure=settings.clickhouse_secure,
        )
        cube = CubeClient(settings.cube_url, settings.cube_api_secret)
        semantic_layer = CubeSemanticLayer(cube)
        unit_of_work_factory = PostgresInvestigationUnitOfWorkFactory(database)
        registry = PostgresAgentRegistry(database)
        recorder = PostgresExecutionRecorder(unit_of_work_factory)

        # A provider with no key is simply absent from the chain, so the whole
        # system still runs on ANTHROPIC_API_KEY alone.
        models = ProviderClients.from_keys(settings.provider_api_keys())
        # Shared across tiers: the limits being tripped belong to our API keys,
        # not to any one tenant.
        breaker = ProviderCircuitBreaker()

        graphs = {
            tier: _build_graph(
                tier=tier,
                models=models,
                breaker=breaker,
                registry=registry,
                semantic_layer=semantic_layer,
                recorder=recorder,
            )
            for tier in ModelTier
        }

        audit_delivery = AuditDeliveryCoordinator(
            unit_of_work_factory=unit_of_work_factory,
            audit=audit,
        )
        investigations = InvestigationService(
            unit_of_work_factory=unit_of_work_factory,
            pipeline=LangGraphInvestigationPipeline(graphs),
            audit_writer=audit_delivery,
            audit_reader=audit_delivery,
            now=lambda: datetime.now(UTC),
            new_id=uuid4,
            publication_observer=record_publication_decision,
            erasure_observer=record_evidence_deletion,
        )
        organization = OrganizationService(
            unit_of_work_factory=PostgresOrganizationUnitOfWorkFactory(database),
            now=lambda: datetime.now(UTC),
            new_id=uuid4,
        )
        threads = ThreadService(
            unit_of_work_factory=PostgresThreadUnitOfWorkFactory(database),
            now=lambda: datetime.now(UTC),
            new_id=uuid4,
        )
        return cls(
            database=database,
            audit=audit,
            cube=cube,
            models=models,
            jwt_verifier=ClerkJwtVerifier(
                settings.clerk_issuer,
                settings.clerk_audience,
            ),
            investigations=investigations,
            audit_delivery=audit_delivery,
            organization=organization,
            threads=threads,
        )

    async def close(self) -> None:
        await self.database.close()
        await self.audit.close()
        await self.models.close()


def _build_graph(
    *,
    tier: ModelTier,
    models: ProviderClients,
    breaker: ProviderCircuitBreaker,
    registry: PostgresAgentRegistry,
    semantic_layer: CubeSemanticLayer,
    recorder: PostgresExecutionRecorder,
) -> InvestigationGraph:
    """One compiled graph per tier.

    The agents are identical; only the routed client behind them differs, which
    is what keeps the tenant's tier out of `ModelPort.complete()`.
    """
    model = RoutedModelClient(
        tier=tier,
        clients=models.as_dict(),
        breaker=breaker,
    )
    # Insight is required, not optional. Nothing else writes a Finding, so a
    # deployment whose registry has not promoted it must refuse at plan time
    # rather than reach the last node with nothing to run.
    return InvestigationGraph(
        orchestrator=OrchestratorAgent(
            model=model,
            registry=registry,
            required_roles=(*REQUIRED_ROLES, AgentRole.INSIGHT),
        ),
        sql_analyst=SqlAnalystAgent(model=model, semantic_layer=semantic_layer),
        evaluator=EvaluatorAgent(model=model, semantic_layer=semantic_layer),
        insight=InsightAgent(model=model),
        recorder=recorder,
    )
