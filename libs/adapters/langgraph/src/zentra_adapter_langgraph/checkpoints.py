from __future__ import annotations

import random
from collections.abc import AsyncIterator, Sequence
from contextlib import asynccontextmanager
from typing import Any
from uuid import UUID

from langchain_core.runnables import RunnableConfig
from langgraph.checkpoint.base import (
    BaseCheckpointSaver,
    ChannelVersions,
    Checkpoint,
    CheckpointMetadata,
    CheckpointTuple,
)
from langgraph.checkpoint.postgres.aio import AsyncPostgresSaver
from psycopg_pool import AsyncConnectionPool


class PostgresCheckpointStore(BaseCheckpointSaver):
    """Tenant-scoped LangGraph checkpoints on the existing control plane."""

    def __init__(self, database_url: str) -> None:
        super().__init__()
        conninfo = database_url.replace("postgresql+psycopg://", "postgresql://", 1)
        self._pool = AsyncConnectionPool(
            conninfo=conninfo,
            min_size=1,
            max_size=4,
            open=False,
            kwargs={"prepare_threshold": 0},
        )

    @property
    def saver(self) -> PostgresCheckpointStore:
        return self

    async def open(self) -> None:
        await self._pool.open()
        await self._pool.wait()

    async def close(self) -> None:
        await self._pool.close()

    async def aget_tuple(self, config: RunnableConfig) -> CheckpointTuple | None:
        async with self._tenant_saver(config) as saver:
            return await saver.aget_tuple(config)

    async def alist(
        self,
        config: RunnableConfig | None,
        *,
        filter: dict[str, Any] | None = None,
        before: RunnableConfig | None = None,
        limit: int | None = None,
    ) -> AsyncIterator[CheckpointTuple]:
        if config is None:
            raise ValueError("Checkpoint listing requires a tenant-scoped config")
        async with self._tenant_saver(config) as saver:
            async for checkpoint in saver.alist(
                config, filter=filter, before=before, limit=limit
            ):
                yield checkpoint

    async def aput(
        self,
        config: RunnableConfig,
        checkpoint: Checkpoint,
        metadata: CheckpointMetadata,
        new_versions: ChannelVersions,
    ) -> RunnableConfig:
        async with self._tenant_saver(config) as saver:
            return await saver.aput(config, checkpoint, metadata, new_versions)

    async def aput_writes(
        self,
        config: RunnableConfig,
        writes: Sequence[tuple[str, Any]],
        task_id: str,
        task_path: str = "",
    ) -> None:
        async with self._tenant_saver(config) as saver:
            await saver.aput_writes(config, writes, task_id, task_path)

    async def adelete_thread(self, thread_id: str) -> None:
        config: RunnableConfig = {"configurable": {"thread_id": thread_id}}
        async with self._tenant_saver(config) as saver:
            await saver.adelete_thread(thread_id)

    def get_next_version(self, current: str | None, channel: None) -> str:
        current_version = 0 if current is None else int(str(current).split(".")[0])
        return f"{current_version + 1:032}.{random.random():016}"

    @asynccontextmanager
    async def _tenant_saver(
        self, config: RunnableConfig
    ) -> AsyncIterator[AsyncPostgresSaver]:
        tenant_id = _tenant_id(config)
        async with (
            self._pool.connection() as connection,
            connection.transaction(),
        ):
            await connection.execute(
                "SELECT set_config('app.tenant_id', %s, true)",
                (str(tenant_id),),
            )
            yield AsyncPostgresSaver(connection, serde=self.serde)


def _tenant_id(config: RunnableConfig) -> UUID:
    configurable = config.get("configurable", {})
    thread_id = str(configurable.get("thread_id", ""))
    tenant, separator, investigation = thread_id.partition(":")
    if not separator or not investigation:
        raise ValueError("Checkpoint thread ID must be tenant:investigation")
    try:
        tenant_id = UUID(tenant)
        UUID(investigation)
    except ValueError as error:
        raise ValueError("Checkpoint thread ID must contain UUIDs") from error
    return tenant_id
