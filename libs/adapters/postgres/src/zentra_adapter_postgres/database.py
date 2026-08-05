from __future__ import annotations

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from uuid import UUID

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncConnection, AsyncEngine, create_async_engine


class Database:
    def __init__(self, database_url: str) -> None:
        if database_url.startswith("postgresql://"):
            database_url = database_url.replace(
                "postgresql://", "postgresql+psycopg://", 1
            )
        self.engine: AsyncEngine = create_async_engine(
            database_url,
            pool_pre_ping=True,
        )

    async def close(self) -> None:
        await self.engine.dispose()

    async def health(self) -> bool:
        try:
            async with self.engine.connect() as connection:
                await connection.execute(text("SELECT 1"))
            return True
        except Exception:
            return False

    @asynccontextmanager
    async def organization_connection(
        self, organization_id: UUID
    ) -> AsyncIterator[AsyncConnection]:
        async with self.engine.begin() as connection:
            await set_organization_context(connection, organization_id)
            yield connection


async def set_organization_context(
    connection: AsyncConnection, organization_id: UUID
) -> None:
    await connection.execute(
        text("SELECT set_config('app.organization_id', :organization_id, true)"),
        {"organization_id": str(organization_id)},
    )
