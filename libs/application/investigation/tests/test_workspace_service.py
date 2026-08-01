from __future__ import annotations

from contextlib import AbstractAsyncContextManager
from datetime import UTC, datetime, timedelta
from uuid import UUID, uuid4

import pytest
from zentra_domain_investigation import Project, WorkspaceGroup

from zentra_application_investigation import (
    AuthenticatedActor,
    PermissionDeniedError,
    Role,
    WorkspaceConflictError,
    WorkspaceNotFoundError,
    WorkspaceService,
)

NOW = datetime(2026, 8, 1, tzinfo=UTC)


class Repository:
    def __init__(self) -> None:
        self.groups: dict[UUID, WorkspaceGroup] = {}
        self.projects: dict[UUID, Project] = {}

    async def add_group(self, group: WorkspaceGroup) -> None:
        self.groups[group.group_id] = group

    async def get_group(
        self, group_id: UUID, *, for_update: bool = False
    ) -> WorkspaceGroup | None:
        return self.groups.get(group_id)

    async def save_group(self, group: WorkspaceGroup) -> None:
        self.groups[group.group_id] = group

    async def list_groups(
        self, *, include_archived: bool
    ) -> tuple[WorkspaceGroup, ...]:
        return tuple(
            sorted(
                (
                    group
                    for group in self.groups.values()
                    if include_archived or group.archived_at is None
                ),
                key=lambda group: (group.updated_at, group.group_id),
                reverse=True,
            )
        )

    async def add_project(self, project: Project) -> None:
        self.projects[project.project_id] = project

    async def get_project(
        self, project_id: UUID, *, for_update: bool = False
    ) -> Project | None:
        return self.projects.get(project_id)

    async def save_project(self, project: Project) -> None:
        self.projects[project.project_id] = project

    async def list_projects(
        self, *, group_id: UUID, include_archived: bool
    ) -> tuple[Project, ...]:
        return tuple(
            sorted(
                (
                    project
                    for project in self.projects.values()
                    if project.group_id == group_id
                    and (include_archived or project.archived_at is None)
                ),
                key=lambda project: (project.updated_at, project.project_id),
                reverse=True,
            )
        )


class UnitOfWork:
    def __init__(self, repository: Repository) -> None:
        self.workspaces = repository
        self.committed = False

    async def __aenter__(self) -> UnitOfWork:
        return self

    async def __aexit__(self, *args: object) -> None:
        return None

    async def commit(self) -> None:
        self.committed = True


class UnitOfWorkFactory:
    def __init__(self, repository: Repository) -> None:
        self.repository = repository

    def __call__(
        self, tenant_id: UUID, trace_id: UUID, span_id: UUID
    ) -> AbstractAsyncContextManager[UnitOfWork]:
        return UnitOfWork(self.repository)


def actor(role: Role) -> AuthenticatedActor:
    return AuthenticatedActor(
        user_id=uuid4(),
        tenant_id=uuid4(),
        role=role,
        trace_id=uuid4(),
        span_id=uuid4(),
    )


def service(repository: Repository | None = None) -> WorkspaceService:
    return WorkspaceService(
        unit_of_work_factory=UnitOfWorkFactory(repository or Repository()),
        now=lambda: NOW,
        new_id=uuid4,
    )


@pytest.mark.asyncio
async def test_owner_creates_group_with_server_decided_permissions() -> None:
    owner = actor(Role.OWNER)

    created = await service().create_group(owner, name="Finance")

    assert created.name == "Finance"
    assert created.can_manage is True
    assert created.archived_at is None


@pytest.mark.asyncio
async def test_member_can_read_but_cannot_organize_groups() -> None:
    member = actor(Role.MEMBER)
    workspace = service()

    with pytest.raises(PermissionDeniedError):
        await workspace.create_group(member, name="Finance")


@pytest.mark.asyncio
@pytest.mark.parametrize("role", [Role.OWNER, Role.ADMIN])
async def test_owner_and_admin_can_organize_groups(role: Role) -> None:
    created = await service().create_group(actor(role), name="Finance")

    assert created.can_manage is True


@pytest.mark.asyncio
@pytest.mark.parametrize("role", [Role.MEMBER, Role.VIEWER])
async def test_member_and_viewer_receive_read_only_permissions(role: Role) -> None:
    repository = Repository()
    reader = actor(role)
    repository.groups[UUID(int=1)] = WorkspaceGroup.create(
        group_id=UUID(int=1),
        tenant_id=reader.tenant_id,
        name="Finance",
        now=NOW,
    )

    page = await service(repository).list_groups(reader)

    assert page.items[0].can_manage is False


@pytest.mark.asyncio
async def test_archived_group_refuses_descendant_creation() -> None:
    repository = Repository()
    workspace = service(repository)
    owner = actor(Role.OWNER)
    group = await workspace.create_group(owner, name="Finance")
    await workspace.archive_group(owner, group.group_id)

    with pytest.raises(WorkspaceConflictError):
        await workspace.create_project(owner, group_id=group.group_id, name="Forecast")


@pytest.mark.asyncio
async def test_project_listing_is_stable_and_cursor_ready() -> None:
    repository = Repository()
    workspace = service(repository)
    owner = actor(Role.ADMIN)
    group = await workspace.create_group(owner, name="Finance")
    first = await workspace.create_project(
        owner, group_id=group.group_id, name="Weekly"
    )
    repository.projects[first.project_id].updated_at = NOW - timedelta(days=1)
    second = await workspace.create_project(
        owner, group_id=group.group_id, name="Monthly"
    )

    page = await workspace.list_projects(owner, group_id=group.group_id, limit=1)

    assert [item.project_id for item in page.items] == [second.project_id]
    assert page.next_cursor is not None


@pytest.mark.asyncio
async def test_inaccessible_parent_is_not_found() -> None:
    with pytest.raises(WorkspaceNotFoundError):
        await service().create_project(
            actor(Role.OWNER), group_id=uuid4(), name="Forecast"
        )
