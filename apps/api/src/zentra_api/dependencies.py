from __future__ import annotations

from dataclasses import dataclass
from typing import Protocol

from zentra_adapter_clickhouse import AuditRepository
from zentra_adapter_cube import CubeClient
from zentra_adapter_postgres import Database

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

    @classmethod
    def from_settings(cls, settings: Settings) -> AppDependencies:
        return cls(
            database=Database(settings.database_url),
            audit=AuditRepository.connect(
                host=settings.clickhouse_host,
                port=settings.clickhouse_port,
                username=settings.clickhouse_username,
                password=settings.clickhouse_password,
                database=settings.clickhouse_database,
                secure=settings.clickhouse_secure,
            ),
            cube=CubeClient(settings.cube_url, settings.cube_api_secret),
            jwt_verifier=ClerkJwtVerifier(
                settings.clerk_issuer,
                settings.clerk_audience,
            ),
        )

    async def close(self) -> None:
        await self.database.close()
        await self.audit.close()
