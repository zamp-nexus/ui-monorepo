from __future__ import annotations

from typing import Annotated, NoReturn
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from zentra_application_investigation import (
    PermissionDeniedError,
    WorkspaceConflictError,
    WorkspaceCursorError,
    WorkspaceNotFoundError,
)
from zentra_domain_investigation import WorkspaceNameError

from .request_context import RequestContext, authenticated_context
from .workspace_schemas import (
    GroupPageResponse,
    GroupResponse,
    ProjectPageResponse,
    ProjectResponse,
    WorkspaceNameRequest,
)

router = APIRouter(prefix="/v1")
AuthenticatedRequest = Annotated[RequestContext, Depends(authenticated_context)]
PageSize = Annotated[int, Query(ge=1, le=100)]


def _workspace_error(error: Exception) -> NoReturn:
    if isinstance(error, PermissionDeniedError):
        code, status_code = "permission_denied", status.HTTP_403_FORBIDDEN
    elif isinstance(error, WorkspaceNotFoundError):
        code, status_code = "workspace_not_found", status.HTTP_404_NOT_FOUND
    elif isinstance(error, WorkspaceConflictError):
        code, status_code = "workspace_conflict", status.HTTP_409_CONFLICT
    elif isinstance(error, (WorkspaceCursorError, WorkspaceNameError, ValueError)):
        code, status_code = "invalid_workspace", status.HTTP_422_UNPROCESSABLE_ENTITY
    else:  # pragma: no cover
        raise error
    raise HTTPException(
        status_code=status_code,
        detail={"code": code, "message": str(error)},
    ) from error


@router.post(
    "/groups", response_model=GroupResponse, status_code=status.HTTP_201_CREATED
)
async def create_group(
    body: WorkspaceNameRequest,
    request: Request,
    resolved: AuthenticatedRequest,
) -> GroupResponse:
    try:
        detail = await request.app.state.dependencies.workspaces.create_group(
            resolved.actor, name=body.name
        )
    except (PermissionDeniedError, WorkspaceConflictError, WorkspaceNameError) as error:
        _workspace_error(error)
    return GroupResponse.from_detail(detail)


@router.get("/groups", response_model=GroupPageResponse)
async def list_groups(
    request: Request,
    resolved: AuthenticatedRequest,
    limit: PageSize = 50,
    cursor: str | None = None,
    include_archived: bool = False,
) -> GroupPageResponse:
    try:
        page = await request.app.state.dependencies.workspaces.list_groups(
            resolved.actor,
            limit=limit,
            cursor=cursor,
            include_archived=include_archived,
        )
    except (WorkspaceCursorError, ValueError) as error:
        _workspace_error(error)
    return GroupPageResponse(
        items=[GroupResponse.from_detail(item) for item in page.items],
        next_cursor=page.next_cursor,
    )


@router.get("/groups/{group_id}", response_model=GroupResponse)
async def get_group(
    group_id: UUID, request: Request, resolved: AuthenticatedRequest
) -> GroupResponse:
    try:
        detail = await request.app.state.dependencies.workspaces.get_group(
            resolved.actor, group_id
        )
    except WorkspaceNotFoundError as error:
        _workspace_error(error)
    return GroupResponse.from_detail(detail)


@router.patch("/groups/{group_id}", response_model=GroupResponse)
async def rename_group(
    group_id: UUID,
    body: WorkspaceNameRequest,
    request: Request,
    resolved: AuthenticatedRequest,
) -> GroupResponse:
    try:
        detail = await request.app.state.dependencies.workspaces.rename_group(
            resolved.actor, group_id, name=body.name
        )
    except (
        PermissionDeniedError,
        WorkspaceNotFoundError,
        WorkspaceConflictError,
        WorkspaceNameError,
    ) as error:
        _workspace_error(error)
    return GroupResponse.from_detail(detail)


@router.post("/groups/{group_id}/archive", response_model=GroupResponse)
async def archive_group(
    group_id: UUID, request: Request, resolved: AuthenticatedRequest
) -> GroupResponse:
    return await _group_transition("archive_group", group_id, request, resolved)


@router.post("/groups/{group_id}/restore", response_model=GroupResponse)
async def restore_group(
    group_id: UUID, request: Request, resolved: AuthenticatedRequest
) -> GroupResponse:
    return await _group_transition("restore_group", group_id, request, resolved)


async def _group_transition(
    operation: str,
    group_id: UUID,
    request: Request,
    resolved: RequestContext,
) -> GroupResponse:
    try:
        detail = await getattr(request.app.state.dependencies.workspaces, operation)(
            resolved.actor, group_id
        )
    except (PermissionDeniedError, WorkspaceNotFoundError) as error:
        _workspace_error(error)
    return GroupResponse.from_detail(detail)


@router.post(
    "/groups/{group_id}/projects",
    response_model=ProjectResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_project(
    group_id: UUID,
    body: WorkspaceNameRequest,
    request: Request,
    resolved: AuthenticatedRequest,
) -> ProjectResponse:
    try:
        detail = await request.app.state.dependencies.workspaces.create_project(
            resolved.actor, group_id=group_id, name=body.name
        )
    except (
        PermissionDeniedError,
        WorkspaceNotFoundError,
        WorkspaceConflictError,
        WorkspaceNameError,
    ) as error:
        _workspace_error(error)
    return ProjectResponse.from_detail(detail)


@router.get("/groups/{group_id}/projects", response_model=ProjectPageResponse)
async def list_projects(
    group_id: UUID,
    request: Request,
    resolved: AuthenticatedRequest,
    limit: PageSize = 50,
    cursor: str | None = None,
    include_archived: bool = False,
) -> ProjectPageResponse:
    try:
        page = await request.app.state.dependencies.workspaces.list_projects(
            resolved.actor,
            group_id=group_id,
            limit=limit,
            cursor=cursor,
            include_archived=include_archived,
        )
    except (WorkspaceNotFoundError, WorkspaceCursorError, ValueError) as error:
        _workspace_error(error)
    return ProjectPageResponse(
        items=[ProjectResponse.from_detail(item) for item in page.items],
        next_cursor=page.next_cursor,
    )


@router.get("/projects/{project_id}", response_model=ProjectResponse)
async def get_project(
    project_id: UUID, request: Request, resolved: AuthenticatedRequest
) -> ProjectResponse:
    try:
        detail = await request.app.state.dependencies.workspaces.get_project(
            resolved.actor, project_id
        )
    except WorkspaceNotFoundError as error:
        _workspace_error(error)
    return ProjectResponse.from_detail(detail)


@router.patch("/projects/{project_id}", response_model=ProjectResponse)
async def rename_project(
    project_id: UUID,
    body: WorkspaceNameRequest,
    request: Request,
    resolved: AuthenticatedRequest,
) -> ProjectResponse:
    try:
        detail = await request.app.state.dependencies.workspaces.rename_project(
            resolved.actor, project_id, name=body.name
        )
    except (
        PermissionDeniedError,
        WorkspaceNotFoundError,
        WorkspaceConflictError,
        WorkspaceNameError,
    ) as error:
        _workspace_error(error)
    return ProjectResponse.from_detail(detail)


@router.post("/projects/{project_id}/archive", response_model=ProjectResponse)
async def archive_project(
    project_id: UUID, request: Request, resolved: AuthenticatedRequest
) -> ProjectResponse:
    return await _project_transition("archive_project", project_id, request, resolved)


@router.post("/projects/{project_id}/restore", response_model=ProjectResponse)
async def restore_project(
    project_id: UUID, request: Request, resolved: AuthenticatedRequest
) -> ProjectResponse:
    return await _project_transition("restore_project", project_id, request, resolved)


async def _project_transition(
    operation: str,
    project_id: UUID,
    request: Request,
    resolved: RequestContext,
) -> ProjectResponse:
    try:
        detail = await getattr(request.app.state.dependencies.workspaces, operation)(
            resolved.actor, project_id
        )
    except (
        PermissionDeniedError,
        WorkspaceNotFoundError,
        WorkspaceConflictError,
    ) as error:
        _workspace_error(error)
    return ProjectResponse.from_detail(detail)
