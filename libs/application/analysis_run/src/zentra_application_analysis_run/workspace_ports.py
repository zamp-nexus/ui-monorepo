from __future__ import annotations

from contextlib import AbstractAsyncContextManager
from typing import Protocol
from uuid import UUID

from zentra_domain_analysis_run import Group

from .workspace_dto import GroupCursor, GroupSlice


class GroupRepository(Protocol):
    async def add_group(self, group: Group) -> None: ...

    async def get_group(
        self, group_id: UUID, *, for_update: bool = False
    ) -> Group | None: ...

    async def save_group(self, group: Group) -> None: ...

    async def list_groups(
        self,
        *,
        include_archived: bool,
        limit: int,
        after: GroupCursor | None,
    ) -> GroupSlice[Group]: ...


class GroupUnitOfWork(Protocol):
    groups: GroupRepository

    async def commit(self) -> None: ...


class GroupUnitOfWorkFactory(Protocol):
    def __call__(
        self, organization_id: UUID, trace_id: UUID, span_id: UUID
    ) -> AbstractAsyncContextManager[GroupUnitOfWork]: ...
