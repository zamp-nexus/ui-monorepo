from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Protocol
from uuid import uuid4

from zentra_adapter_clickhouse import AuditRepository
from zentra_adapter_cube import CubeClient, EuRefundSpikeScenario
from zentra_adapter_postgres import (
    Database,
    PostgresInvestigationUnitOfWorkFactory,
)
from zentra_application_investigation import InvestigationService

from .audit_delivery import AuditDeliveryCoordinator
from .auth import ClerkJwtVerifier
from .settings import Settings


class HealthProbe(Protocol):
    async def health(self) -> bool: ...


@dataclass(slots=True)
class AppDependencies:
    database: Database
    audit: AuditRepository
    cube: CubeClient
    jwt_verifier: ClerkJwtVerifier
    investigations: InvestigationService
    audit_delivery: AuditDeliveryCoordinator

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
        unit_of_work_factory = PostgresInvestigationUnitOfWorkFactory(database)
        audit_delivery = AuditDeliveryCoordinator(
            unit_of_work_factory=unit_of_work_factory,
            audit=audit,
        )
        investigations = InvestigationService(
            unit_of_work_factory=unit_of_work_factory,
            scenario=EuRefundSpikeScenario(cube),
            audit_writer=audit_delivery,
            audit_reader=audit_delivery,
            now=lambda: datetime.now(UTC),
            new_id=uuid4,
        )
        return cls(
            database=database,
            audit=audit,
            cube=cube,
            jwt_verifier=ClerkJwtVerifier(
                settings.clerk_issuer,
                settings.clerk_audience,
            ),
            investigations=investigations,
            audit_delivery=audit_delivery,
        )

    async def close(self) -> None:
        await self.database.close()
        await self.audit.close()
