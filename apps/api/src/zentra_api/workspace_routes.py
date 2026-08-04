from __future__ import annotations

from typing import Annotated, NoReturn
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from zentra_application_investigation import (
    GroupConflictError,
    GroupCursorError,
    GroupNotFoundError,
    PermissionDeniedError,
)
from zentra_domain_investigation import GroupNameError

from .request_context import RequestContext, authenticated_context
from .workspace_schemas import (
    GroupNameRequest,
    GroupPageResponse,
    GroupResponse,
)

router = APIRouter(prefix="/v1")
AuthenticatedRequest = Annotated[RequestContext, Depends(authenticated_context)]
PageSize = Annotated[int, Query(ge=1, le=100)]


def _workspace_error(error: Exception) -> NoReturn:
    if isinstance(error, PermissionDeniedError):
        code, status_code = "permission_denied", status.HTTP_403_FORBIDDEN
    elif isinstance(error, GroupNotFoundError):
        code, status_code = "workspace_not_found", status.HTTP_404_NOT_FOUND
    elif isinstance(error, GroupConflictError):
        code, status_code = "workspace_conflict", status.HTTP_409_CONFLICT
    elif isinstance(
        error, (GroupCursorError, GroupNameError, ValueError)
    ):
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
    body: GroupNameRequest,
    request: Request,
    resolved: AuthenticatedRequest,
) -> GroupResponse:
    try:
        detail = await request.app.state.dependencies.groups.create_group(
            resolved.actor, name=body.name
        )
    except (
        PermissionDeniedError,
        GroupConflictError,
        GroupNameError,
    ) as error:
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
        page = await request.app.state.dependencies.groups.list_groups(
            resolved.actor,
            limit=limit,
            cursor=cursor,
            include_archived=include_archived,
        )
    except (GroupCursorError, ValueError) as error:
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
        detail = await request.app.state.dependencies.groups.get_group(
            resolved.actor, group_id
        )
    except GroupNotFoundError as error:
        _workspace_error(error)
    return GroupResponse.from_detail(detail)


@router.patch("/groups/{group_id}", response_model=GroupResponse)
async def rename_group(
    group_id: UUID,
    body: GroupNameRequest,
    request: Request,
    resolved: AuthenticatedRequest,
) -> GroupResponse:
    try:
        detail = await request.app.state.dependencies.groups.rename_group(
            resolved.actor, group_id, name=body.name
        )
    except (
        PermissionDeniedError,
        GroupNotFoundError,
        GroupConflictError,
        GroupNameError,
    ) as error:
        _workspace_error(error)
    return GroupResponse.from_detail(detail)


@router.post("/groups/{group_id}/archive", response_model=GroupResponse)
async def archive_group(
    group_id: UUID, request: Request, resolved: AuthenticatedRequest
) -> GroupResponse:
    try:
        detail = await request.app.state.dependencies.groups.archive_group(
            resolved.actor, group_id
        )
    except (PermissionDeniedError, GroupNotFoundError) as error:
        _workspace_error(error)
    return GroupResponse.from_detail(detail)


@router.post("/groups/{group_id}/restore", response_model=GroupResponse)
async def restore_group(
    group_id: UUID, request: Request, resolved: AuthenticatedRequest
) -> GroupResponse:
    try:
        detail = await request.app.state.dependencies.groups.restore_group(
            resolved.actor, group_id
        )
    except (PermissionDeniedError, GroupNotFoundError) as error:
        _workspace_error(error)
    return GroupResponse.from_detail(detail)
