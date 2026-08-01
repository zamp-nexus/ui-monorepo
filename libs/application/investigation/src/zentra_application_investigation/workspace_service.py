from __future__ import annotations

from collections.abc import Callable, Sequence
from datetime import datetime
from uuid import UUID

from zentra_domain_investigation import Project, WorkspaceGroup

from .dto import AuthenticatedActor, PermissionDeniedError, Role
from .workspace_dto import (
    GroupDetail,
    ProjectDetail,
    WorkspaceConflictError,
    WorkspaceCursor,
    WorkspaceNotFoundError,
    WorkspacePage,
)
from .workspace_ports import WorkspaceUnitOfWorkFactory

MANAGER_ROLES = frozenset({Role.OWNER, Role.ADMIN})
DEFAULT_PAGE_SIZE = 50
MAX_PAGE_SIZE = 100


class WorkspaceService:
    def __init__(
        self,
        *,
        unit_of_work_factory: WorkspaceUnitOfWorkFactory,
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
        group = WorkspaceGroup.create(
            group_id=self._new_id(),
            tenant_id=actor.tenant_id,
            name=name,
            now=self._now(),
        )
        async with self._uow(actor) as unit_of_work:
            await unit_of_work.workspaces.add_group(group)
            await unit_of_work.commit()
        return self._group_detail(group, actor)

    async def get_group(self, actor: AuthenticatedActor, group_id: UUID) -> GroupDetail:
        async with self._uow(actor) as unit_of_work:
            group = await unit_of_work.workspaces.get_group(group_id)
        return self._group_detail(self._require_group(group), actor)

    async def list_groups(
        self,
        actor: AuthenticatedActor,
        *,
        include_archived: bool = False,
        limit: int = DEFAULT_PAGE_SIZE,
        cursor: str | None = None,
    ) -> WorkspacePage[GroupDetail]:
        limit = self._page_size(limit)
        async with self._uow(actor) as unit_of_work:
            groups = await unit_of_work.workspaces.list_groups(
                include_archived=include_archived
            )
        page, next_cursor = self._page(groups, limit=limit, cursor=cursor)
        return WorkspacePage(
            items=tuple(self._group_detail(group, actor) for group in page),
            next_cursor=next_cursor,
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

    async def create_project(
        self,
        actor: AuthenticatedActor,
        *,
        group_id: UUID,
        name: str,
    ) -> ProjectDetail:
        self._require_manager(actor)
        async with self._uow(actor) as unit_of_work:
            group = self._require_group(
                await unit_of_work.workspaces.get_group(group_id, for_update=True)
            )
            if group.archived_at is not None:
                raise WorkspaceConflictError("Archived Groups cannot accept Projects")
            project = Project.create(
                project_id=self._new_id(),
                tenant_id=actor.tenant_id,
                group_id=group_id,
                name=name,
                now=self._now(),
            )
            await unit_of_work.workspaces.add_project(project)
            await unit_of_work.commit()
        return self._project_detail(project, actor)

    async def get_project(
        self, actor: AuthenticatedActor, project_id: UUID
    ) -> ProjectDetail:
        async with self._uow(actor) as unit_of_work:
            project = await unit_of_work.workspaces.get_project(project_id)
        return self._project_detail(self._require_project(project), actor)

    async def list_projects(
        self,
        actor: AuthenticatedActor,
        *,
        group_id: UUID,
        include_archived: bool = False,
        limit: int = DEFAULT_PAGE_SIZE,
        cursor: str | None = None,
    ) -> WorkspacePage[ProjectDetail]:
        limit = self._page_size(limit)
        async with self._uow(actor) as unit_of_work:
            self._require_group(await unit_of_work.workspaces.get_group(group_id))
            projects = await unit_of_work.workspaces.list_projects(
                group_id=group_id, include_archived=include_archived
            )
        page, next_cursor = self._page(projects, limit=limit, cursor=cursor)
        return WorkspacePage(
            items=tuple(self._project_detail(project, actor) for project in page),
            next_cursor=next_cursor,
        )

    async def rename_project(
        self, actor: AuthenticatedActor, project_id: UUID, *, name: str
    ) -> ProjectDetail:
        return await self._change_project(
            actor, project_id, lambda project: project.rename(name, self._now())
        )

    async def archive_project(
        self, actor: AuthenticatedActor, project_id: UUID
    ) -> ProjectDetail:
        return await self._change_project(
            actor, project_id, lambda project: project.archive(self._now())
        )

    async def restore_project(
        self, actor: AuthenticatedActor, project_id: UUID
    ) -> ProjectDetail:
        return await self._change_project(
            actor, project_id, lambda project: project.restore(self._now())
        )

    async def _change_group(
        self,
        actor: AuthenticatedActor,
        group_id: UUID,
        change: Callable[[WorkspaceGroup], None],
    ) -> GroupDetail:
        self._require_manager(actor)
        async with self._uow(actor) as unit_of_work:
            group = self._require_group(
                await unit_of_work.workspaces.get_group(group_id, for_update=True)
            )
            change(group)
            await unit_of_work.workspaces.save_group(group)
            await unit_of_work.commit()
        return self._group_detail(group, actor)

    async def _change_project(
        self,
        actor: AuthenticatedActor,
        project_id: UUID,
        change: Callable[[Project], None],
    ) -> ProjectDetail:
        self._require_manager(actor)
        async with self._uow(actor) as unit_of_work:
            project = self._require_project(
                await unit_of_work.workspaces.get_project(project_id, for_update=True)
            )
            group = self._require_group(
                await unit_of_work.workspaces.get_group(project.group_id)
            )
            if group.archived_at is not None:
                raise WorkspaceConflictError("Archived Groups make Projects read-only")
            change(project)
            await unit_of_work.workspaces.save_project(project)
            await unit_of_work.commit()
        return self._project_detail(project, actor)

    def _uow(self, actor: AuthenticatedActor):
        return self._unit_of_work_factory(
            actor.tenant_id, actor.trace_id, actor.span_id
        )

    @staticmethod
    def _require_manager(actor: AuthenticatedActor) -> None:
        if actor.role not in MANAGER_ROLES:
            raise PermissionDeniedError("This membership cannot organize workspaces")

    @staticmethod
    def _require_group(group: WorkspaceGroup | None) -> WorkspaceGroup:
        if group is None:
            raise WorkspaceNotFoundError("Group was not found")
        return group

    @staticmethod
    def _require_project(project: Project | None) -> Project:
        if project is None:
            raise WorkspaceNotFoundError("Project was not found")
        return project

    @staticmethod
    def _page_size(limit: int) -> int:
        if limit < 1 or limit > MAX_PAGE_SIZE:
            raise ValueError(f"Page size must be between 1 and {MAX_PAGE_SIZE}")
        return limit

    @staticmethod
    def _page(
        resources: Sequence[WorkspaceGroup] | Sequence[Project],
        *,
        limit: int,
        cursor: str | None,
    ) -> tuple[Sequence[WorkspaceGroup] | Sequence[Project], str | None]:
        if cursor is not None:
            after = WorkspaceCursor.decode(cursor)
            resources = tuple(
                resource
                for resource in resources
                if (
                    resource.updated_at,
                    resource.group_id
                    if isinstance(resource, WorkspaceGroup)
                    else resource.project_id,
                )
                < (after.updated_at, after.resource_id)
            )
        page = resources[: limit + 1]
        if len(page) <= limit:
            return page, None
        visible = page[:limit]
        last = visible[-1]
        resource_id = (
            last.group_id if isinstance(last, WorkspaceGroup) else last.project_id
        )
        return visible, WorkspaceCursor(last.updated_at, resource_id).encode()

    @staticmethod
    def _group_detail(group: WorkspaceGroup, actor: AuthenticatedActor) -> GroupDetail:
        return GroupDetail(
            group_id=group.group_id,
            name=group.name,
            created_at=group.created_at,
            updated_at=group.updated_at,
            archived_at=group.archived_at,
            can_manage=actor.role in MANAGER_ROLES,
        )

    @staticmethod
    def _project_detail(project: Project, actor: AuthenticatedActor) -> ProjectDetail:
        return ProjectDetail(
            project_id=project.project_id,
            group_id=project.group_id,
            name=project.name,
            created_at=project.created_at,
            updated_at=project.updated_at,
            archived_at=project.archived_at,
            can_manage=actor.role in MANAGER_ROLES,
        )
