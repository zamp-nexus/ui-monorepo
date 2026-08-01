from __future__ import annotations

import asyncio
import os
import socket
from contextlib import suppress
from dataclasses import dataclass
from datetime import UTC, datetime
from decimal import Decimal
from typing import Protocol
from uuid import UUID, uuid4

from zentra_adapter_clickhouse import (
    AesGcmCredentialCipher,
    AuditRepository,
    ClickHouseLandingZone,
    ClickHouseSourceConnector,
)
from zentra_adapter_cube import CubeClient, CubeSemanticLayer
from zentra_adapter_langgraph import (
    EvaluatorAgent,
    InsightAgent,
    InvestigationGraph,
    OrchestratorAgent,
    PostgresCheckpointStore,
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
    PostgresAgentAccessRepository,
    PostgresCatalogRepository,
    PostgresDataSourceRepository,
    PostgresHarvestRunRepository,
    PostgresInvestigationUnitOfWorkFactory,
    PostgresOrganizationUnitOfWorkFactory,
    PostgresRelationRepository,
    PostgresThreadUnitOfWorkFactory,
)
from zentra_adapter_telemetry import (
    record_evidence_deletion,
    record_publication_decision,
)
from zentra_adapter_thesys import ThesysC1Client
from zentra_application_connector import ConnectorService
from zentra_application_investigation import (
    ExecutionJobWorker,
    InvestigationService,
    OrganizationService,
    ThreadService,
    VisualizationService,
)
from zentra_domain_agent_execution import AgentRole

from .audit_delivery import AuditDeliveryCoordinator
from .auth import ClerkJwtVerifier
from .connector_model import relation_fingerprint
from .cube_scope import ScopedCubeSemanticLayers
from .pipeline import (
    LangGraphInvestigationPipeline,
    PostgresExecutionRecorder,
)
from .registry import PostgresAgentRegistry
from .settings import Settings


class HealthProbe(Protocol):
    async def health(self) -> bool: ...


class _UtcClock:
    """The Connector's `Clock` port.

    A class rather than the `now=lambda` the Investigation service takes,
    because that port asks for an object with a `now()` method.
    """

    def now(self) -> datetime:
        return datetime.now(UTC)


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
    checkpoints: PostgresCheckpointStore
    execution_worker: ExecutionJobWorker
    execution_worker_enabled: bool
    registry: PostgresAgentRegistry
    visualizations: VisualizationService | None = None
    #: Absent when `CONNECTOR_CREDENTIAL_KEY` is unset. `None` rather than a
    #: service with no key: the Connector routes then fail with a message
    #: naming the missing configuration, instead of accepting a password they
    #: cannot seal. Last because a defaulted field must follow the required ones.
    #: The internal Cube model endpoint and connector_model.py's functions
    #: fail the same way — a clear, typed error rather than an
    #: AttributeError — whenever this is unset.
    worker_task: asyncio.Task[None] | None = None
    connector: ConnectorService | None = None

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
        # Unauthenticated: /readyz needs no token, and a health probe must
        # not depend on a JWT's expiry.
        cube = CubeClient(settings.cube_url, None)
        unit_of_work_factory = PostgresInvestigationUnitOfWorkFactory(database)
        registry = PostgresAgentRegistry(database)
        recorder = PostgresExecutionRecorder(unit_of_work_factory)
        checkpoints = PostgresCheckpointStore(settings.database_url)

        # A provider with no key is simply absent from the chain, so the whole
        # system still runs on ANTHROPIC_API_KEY alone.
        models = ProviderClients.from_keys(settings.provider_api_keys())
        # Shared across tiers: the limits being tripped belong to our API keys,
        # not to any one tenant.
        breaker = ProviderCircuitBreaker()

        connector: ConnectorService | None = None

        async def resolve_relation_fingerprint(
            tenant_id: UUID, data_connection_id: UUID
        ) -> str:
            return await relation_fingerprint(
                connector,
                tenant_id=tenant_id,
                data_connection_id=data_connection_id,
            )

        semantic_layers = ScopedCubeSemanticLayers(
            cube_url=settings.cube_url,
            cube_api_secret=settings.cube_api_secret,
            resolve_relation_fingerprint=resolve_relation_fingerprint,
        )

        graph_factories = {
            tier: _build_graph_factory(
                tier=tier,
                models=models,
                breaker=breaker,
                registry=registry,
                recorder=recorder,
                checkpointer=checkpoints.saver,
            )
            for tier in ModelTier
        }

        audit_delivery = AuditDeliveryCoordinator(
            unit_of_work_factory=unit_of_work_factory,
            audit=audit,
        )
        investigations = InvestigationService(
            unit_of_work_factory=unit_of_work_factory,
            pipeline=LangGraphInvestigationPipeline(graph_factories, semantic_layers),
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
        visualizations = VisualizationService(
            unit_of_work_factory=unit_of_work_factory,
            renderer=(
                ThesysC1Client(
                    api_key=settings.thesys_api_key,
                    model=settings.thesys_model,
                    input_price_per_million=Decimal(
                        str(settings.thesys_input_price_per_million)
                    ),
                    output_price_per_million=Decimal(
                        str(settings.thesys_output_price_per_million)
                    ),
                )
                if settings.thesys_api_key
                else None
            ),
            now=lambda: datetime.now(UTC),
            new_id=uuid4,
            continuation=threads,
        )
        connector = (
            ConnectorService(
                sources=PostgresDataSourceRepository(database),
                catalogs=PostgresCatalogRepository(database),
                relations=PostgresRelationRepository(database),
                runs=PostgresHarvestRunRepository(database),
                access=PostgresAgentAccessRepository(database),
                connector=ClickHouseSourceConnector(),
                # The key comes from Settings rather than `from_env` so it is
                # read the same way as every other secret, and one .env file
                # remains the single place configuration lives.
                cipher=AesGcmCredentialCipher(
                    bytes.fromhex(settings.connector_credential_key)
                ),
                landing_zone=ClickHouseLandingZone(
                    host=settings.clickhouse_host,
                    port=settings.clickhouse_port,
                    username=settings.clickhouse_username,
                    password=settings.clickhouse_password,
                    secure=settings.clickhouse_secure,
                ),
                clock=_UtcClock(),
            )
            if settings.connector_credential_key
            else None
        )
        worker_id = settings.execution_worker_id or (
            f"{socket.gethostname()}:{os.getpid()}"
        )
        execution_worker = ExecutionJobWorker(
            unit_of_work_factory=unit_of_work_factory,
            executor=investigations,
            visualization_executor=visualizations,
            worker_id=worker_id,
            now=lambda: datetime.now(UTC),
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
            checkpoints=checkpoints,
            execution_worker=execution_worker,
            execution_worker_enabled=settings.execution_worker_enabled,
            registry=registry,
            visualizations=visualizations,
            connector=connector,
        )

    async def start(self) -> None:
        await self.checkpoints.open()
        self.audit_delivery.start()
        if self.execution_worker_enabled and self.worker_task is None:
            self.worker_task = asyncio.create_task(
                self.execution_worker.run_forever(),
                name="investigation-execution-worker",
            )

    async def stop(self) -> None:
        self.execution_worker.stop()
        if self.worker_task is not None:
            self.worker_task.cancel()
            with suppress(asyncio.CancelledError):
                await self.worker_task
            self.worker_task = None
        await self.audit_delivery.stop()
        await self.checkpoints.close()

    async def close(self) -> None:
        await self.database.close()
        await self.audit.close()
        await self.models.close()


def _build_graph_factory(
    *,
    tier: ModelTier,
    models: ProviderClients,
    breaker: ProviderCircuitBreaker,
    registry: PostgresAgentRegistry,
    recorder: PostgresExecutionRecorder,
    checkpointer: object | None = None,
):
    """A graph builder per tier, parameterized by the semantic layer.

    The agents are identical; only the routed client behind them differs,
    which is what keeps the tenant's tier out of `ModelPort.complete()`. The
    semantic layer is a runtime argument rather than closed over here
    because it must be scoped per (tenant, Data Connection), not per tier —
    see `ScopedCubeSemanticLayers`.
    """
    model = RoutedModelClient(
        tier=tier,
        clients=models.as_dict(),
        breaker=breaker,
    )

    def build(semantic_layer: CubeSemanticLayer) -> InvestigationGraph:
        # Insight is required, not optional. Nothing else writes a Finding, so
        # a deployment whose registry has not promoted it must refuse at plan
        # time rather than reach the last node with nothing to run.
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
            checkpointer=checkpointer,
            cancellation_checkpoint=recorder.cancellation_checkpoint,
        )

    return build
