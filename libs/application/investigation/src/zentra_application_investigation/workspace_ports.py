from __future__ import annotations

from contextlib import AbstractAsyncContextManager
from typing import Protocol
from uuid import UUID

from zentra_domain_investigation import Project, WorkspaceGroup


class WorkspaceRepository(Protocol):
    async def add_group(self, group: WorkspaceGroup) -> None: ...

    async def get_group(
        self, group_id: UUID, *, for_update: bool = False
    ) -> WorkspaceGroup | None: ...

    async def save_group(self, group: WorkspaceGroup) -> None: ...

    async def list_groups(
        self, *, include_archived: bool
    ) -> tuple[WorkspaceGroup, ...]: ...

    async def add_project(self, project: Project) -> None: ...

    async def get_project(
        self, project_id: UUID, *, for_update: bool = False
    ) -> Project | None: ...

    async def save_project(self, project: Project) -> None: ...

    async def list_projects(
        self, *, group_id: UUID, include_archived: bool
    ) -> tuple[Project, ...]: ...


class WorkspaceUnitOfWork(Protocol):
    workspaces: WorkspaceRepository

    async def commit(self) -> None: ...


class WorkspaceUnitOfWorkFactory(Protocol):
    def __call__(
        self, tenant_id: UUID, trace_id: UUID, span_id: UUID
    ) -> AbstractAsyncContextManager[WorkspaceUnitOfWork]: ...
