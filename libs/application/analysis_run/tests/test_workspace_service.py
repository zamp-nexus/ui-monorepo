from __future__ import annotations

from contextlib import AbstractAsyncContextManager
from datetime import UTC, datetime
from uuid import UUID, uuid4

import pytest
from zentra_domain_analysis_run import Group

from zentra_application_analysis_run import (
    AuthenticatedActor,
    GroupCursor,
    GroupService,
    GroupSlice,
    PermissionDeniedError,
    Role,
)

NOW = datetime(2026, 8, 1, tzinfo=UTC)


class Repository:
    def __init__(self) -> None:
        self.groups: dict[UUID, Group] = {}

    async def add_group(self, group: Group) -> None:
        self.groups[group.group_id] = group

    async def get_group(
        self, group_id: UUID, organization_id: UUID, *, for_update: bool = False
    ) -> Group | None:
        group = self.groups.get(group_id)
        if group is None or group.organization_id != organization_id:
            return None
        return group

    async def save_group(
        self, group: Group, *, organization_id: UUID
    ) -> None:
        self.groups[group.group_id] = group

    async def list_groups(
        self,
        organization_id: UUID,
        *,
        include_archived: bool,
        limit: int,
        after: GroupCursor | None,
    ) -> GroupSlice[Group]:
        values = tuple(
            sorted(
                (
                    group
                    for group in self.groups.values()
                    if group.organization_id == organization_id
                    and (include_archived or group.archived_at is None)
                ),
                key=lambda group: (group.updated_at, group.group_id),
                reverse=True,
            )
        )
        if after:
            values = tuple(
                group
                for group in values
                if (group.updated_at, group.group_id)
                < (after.sort_at, after.resource_id)
            )
        page = values[: limit + 1]
        if len(page) <= limit:
            return GroupSlice(page, None)
        last = page[limit - 1]
        return GroupSlice(
            page[:limit], GroupCursor(last.updated_at, last.group_id)
        )


class UnitOfWork:
    def __init__(self, repository: Repository) -> None:
        self.groups = repository
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
        self, organization_id: UUID, trace_id: UUID, span_id: UUID
    ) -> AbstractAsyncContextManager[UnitOfWork]:
        return UnitOfWork(self.repository)


def actor(role: Role) -> AuthenticatedActor:
    return AuthenticatedActor(
        user_id=uuid4(),
        organization_id=uuid4(),
        role=role,
        trace_id=uuid4(),
        span_id=uuid4(),
    )


def service(repository: Repository | None = None) -> GroupService:
    return GroupService(
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
    repository.groups[UUID(int=1)] = Group.create(
        group_id=UUID(int=1),
        organization_id=reader.organization_id,
        name="Finance",
        now=NOW,
    )

    page = await service(repository).list_groups(reader)

    assert page.items[0].can_manage is False


@pytest.mark.asyncio
async def test_archived_group_can_be_restored() -> None:
    repository = Repository()
    workspace = service(repository)
    owner = actor(Role.OWNER)
    group = await workspace.create_group(owner, name="Finance")

    await workspace.archive_group(owner, group.group_id)
    archived = await workspace.get_group(owner, group.group_id)
    assert archived.archived_at == NOW
    assert archived.can_manage is True

    await workspace.restore_group(owner, group.group_id)
    restored = await workspace.get_group(owner, group.group_id)
    assert restored.archived_at is None


@pytest.mark.asyncio
@pytest.mark.parametrize("role", [Role.MEMBER, Role.VIEWER])
async def test_read_only_roles_cannot_manage_groups(role: Role) -> None:
    repository = Repository()
    owner = actor(Role.OWNER)
    workspace = service(repository)
    group = await workspace.create_group(owner, name="Finance")
    reader = actor(role)

    operations = (
        workspace.rename_group(reader, group.group_id, name="Other"),
        workspace.archive_group(reader, group.group_id),
        workspace.restore_group(reader, group.group_id),
    )
    for operation in operations:
        with pytest.raises(PermissionDeniedError):
            await operation
