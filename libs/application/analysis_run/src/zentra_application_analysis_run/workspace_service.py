from __future__ import annotations

from collections.abc import Callable
from datetime import datetime
from uuid import UUID

from zentra_domain_analysis_run import Group

from .dto import AuthenticatedActor, PermissionDeniedError, Role
from .workspace_dto import (
    GroupCursor,
    GroupDetail,
    GroupNotFoundError,
    GroupPage,
)
from .workspace_ports import GroupUnitOfWorkFactory

MANAGER_ROLES = frozenset({Role.OWNER, Role.ADMIN})
DEFAULT_PAGE_SIZE = 50
MAX_PAGE_SIZE = 100


class GroupService:
    def __init__(
        self,
        *,
        unit_of_work_factory: GroupUnitOfWorkFactory,
        now: Callable[[], datetime],
        new_id: Callable[[], UUID],
    ) -> None:
        self._unit_of_work_factory = unit_of_work_factory
        self._now = now
        self._new_id = new_id

    async def create_group(
        self, actor: AuthenticatedActor, *, name: str
    ) -> GroupDetail:
        self._require_manager(actor)
        group = Group.create(
            group_id=self._new_id(),
            organization_id=actor.organization_id,
            name=name,
            now=self._now(),
        )
        async with self._uow(actor) as unit_of_work:
            await unit_of_work.groups.add_group(group)
            await unit_of_work.commit()
        return self._group_detail(group, actor)

    async def get_group(self, actor: AuthenticatedActor, group_id: UUID) -> GroupDetail:
        async with self._uow(actor) as unit_of_work:
            group = await unit_of_work.groups.get_group(group_id, actor.organization_id)
        return self._group_detail(self._require_group(group), actor)

    async def list_groups(
        self,
        actor: AuthenticatedActor,
        *,
        include_archived: bool = False,
        limit: int = DEFAULT_PAGE_SIZE,
        cursor: str | None = None,
    ) -> GroupPage[GroupDetail]:
        limit = self._page_size(limit)
        after = GroupCursor.decode(cursor) if cursor is not None else None
        async with self._uow(actor) as unit_of_work:
            page = await unit_of_work.groups.list_groups(
                include_archived=include_archived, limit=limit, after=after
            )
        return GroupPage(
            items=tuple(self._group_detail(group, actor) for group in page.items),
            next_cursor=page.next_cursor.encode() if page.next_cursor else None,
        )

    async def rename_group(
        self, actor: AuthenticatedActor, group_id: UUID, *, name: str
    ) -> GroupDetail:
        return await self._change_group(
            actor, group_id, lambda group: group.rename(name, self._now())
        )

    async def archive_group(
        self, actor: AuthenticatedActor, group_id: UUID
    ) -> GroupDetail:
        return await self._change_group(
            actor, group_id, lambda group: group.archive(self._now())
        )

    async def restore_group(
        self, actor: AuthenticatedActor, group_id: UUID
    ) -> GroupDetail:
        return await self._change_group(
            actor, group_id, lambda group: group.restore(self._now())
        )

    async def _change_group(
        self,
        actor: AuthenticatedActor,
        group_id: UUID,
        change: Callable[[Group], None],
    ) -> GroupDetail:
        self._require_manager(actor)
        async with self._uow(actor) as unit_of_work:
            group = self._require_group(
                await unit_of_work.groups.get_group(
                    group_id, actor.organization_id, for_update=True
                )
            )
            change(group)
            await unit_of_work.groups.save_group(group)
            await unit_of_work.commit()
        return self._group_detail(group, actor)

    def _uow(self, actor: AuthenticatedActor):
        return self._unit_of_work_factory(
            actor.organization_id, actor.trace_id, actor.span_id
        )

    @staticmethod
    def _require_manager(actor: AuthenticatedActor) -> None:
        if actor.role not in MANAGER_ROLES:
            raise PermissionDeniedError("This membership cannot organize workspaces")

    @staticmethod
    def _require_group(group: Group | None) -> Group:
        if group is None:
            raise GroupNotFoundError("Group was not found")
        return group

    @staticmethod
    def _page_size(limit: int) -> int:
        if limit < 1 or limit > MAX_PAGE_SIZE:
            raise ValueError(f"Page size must be between 1 and {MAX_PAGE_SIZE}")
        return limit

    @staticmethod
    def _group_detail(group: Group, actor: AuthenticatedActor) -> GroupDetail:
        return GroupDetail(
            group_id=group.group_id,
            name=group.name,
            created_at=group.created_at,
            updated_at=group.updated_at,
            archived_at=group.archived_at,
            can_manage=actor.role in MANAGER_ROLES,
        )
