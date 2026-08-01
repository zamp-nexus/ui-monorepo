from __future__ import annotations

from contextlib import suppress
from typing import Annotated, NoReturn
from uuid import UUID

from fastapi import (
    APIRouter,
    BackgroundTasks,
    Depends,
    HTTPException,
    Query,
    Request,
    status,
)
from zentra_application_investigation import (
    AuthenticatedActor,
    InvestigationService,
    PermissionDeniedError,
    ThreadConflictError,
    ThreadCursorError,
    ThreadNotFoundError,
)
from zentra_domain_investigation import ThreadMessageError, ThreadTransitionError

from .request_context import RequestContext, authenticated_context
from .thread_schemas import ThreadMessageRequest, ThreadPageResponse, ThreadResponse

router = APIRouter(prefix="/v1")
AuthenticatedRequest = Annotated[RequestContext, Depends(authenticated_context)]
PageSize = Annotated[int, Query(ge=1, le=100)]


def _thread_error(error: Exception) -> NoReturn:
    if isinstance(error, PermissionDeniedError):
        code, status_code = "permission_denied", status.HTTP_403_FORBIDDEN
    elif isinstance(error, ThreadNotFoundError):
        code, status_code = "thread_not_found", status.HTTP_404_NOT_FOUND
    elif isinstance(error, (ThreadConflictError, ThreadTransitionError)):
        code, status_code = "thread_conflict", status.HTTP_409_CONFLICT
    elif isinstance(error, (ThreadMessageError, ThreadCursorError, ValueError)):
        code, status_code = "invalid_thread", status.HTTP_422_UNPROCESSABLE_ENTITY
    else:  # pragma: no cover
        raise error
    raise HTTPException(
        status_code=status_code,
        detail={"code": code, "message": str(error)},
    ) from error


async def _run_pipeline(
    investigations: InvestigationService,
    actor: AuthenticatedActor,
    investigation_id: UUID,
) -> None:
    with suppress(Exception):
        await investigations.execute(actor, investigation_id)


@router.post(
    "/projects/{project_id}/threads",
    response_model=ThreadResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_thread(
    project_id: UUID,
    body: ThreadMessageRequest,
    request: Request,
    background: BackgroundTasks,
    resolved: AuthenticatedRequest,
) -> ThreadResponse:
    try:
        detail = await request.app.state.dependencies.threads.create(
            resolved.actor, project_id=project_id, content=body.message
        )
    except (
        PermissionDeniedError,
        ThreadNotFoundError,
        ThreadConflictError,
        ThreadMessageError,
    ) as error:
        _thread_error(error)
    if detail.investigation_id is not None:
        background.add_task(
            _run_pipeline,
            request.app.state.dependencies.investigations,
            resolved.actor,
            detail.investigation_id,
        )
    return ThreadResponse.from_detail(detail)


@router.get("/projects/{project_id}/threads", response_model=ThreadPageResponse)
async def list_threads(
    project_id: UUID,
    request: Request,
    resolved: AuthenticatedRequest,
    limit: PageSize = 50,
    cursor: str | None = None,
    include_archived: bool = False,
) -> ThreadPageResponse:
    try:
        detail = await request.app.state.dependencies.threads.list(
            resolved.actor,
            project_id=project_id,
            limit=limit,
            cursor=cursor,
            include_archived=include_archived,
        )
    except (ThreadNotFoundError, ThreadCursorError, ValueError) as error:
        _thread_error(error)
    return ThreadPageResponse.from_detail(detail)


@router.get("/threads/{thread_id}", response_model=ThreadResponse)
async def get_thread(
    thread_id: UUID, request: Request, resolved: AuthenticatedRequest
) -> ThreadResponse:
    try:
        detail = await request.app.state.dependencies.threads.get(
            resolved.actor, thread_id
        )
    except ThreadNotFoundError as error:
        _thread_error(error)
    return ThreadResponse.from_detail(detail)


@router.post("/threads/{thread_id}/messages", response_model=ThreadResponse)
async def append_thread_message(
    thread_id: UUID,
    body: ThreadMessageRequest,
    request: Request,
    background: BackgroundTasks,
    resolved: AuthenticatedRequest,
) -> ThreadResponse:
    try:
        detail = await request.app.state.dependencies.threads.append(
            resolved.actor, thread_id=thread_id, content=body.message
        )
    except (
        PermissionDeniedError,
        ThreadNotFoundError,
        ThreadConflictError,
        ThreadMessageError,
    ) as error:
        _thread_error(error)
    if detail.investigation_id is not None:
        background.add_task(
            _run_pipeline,
            request.app.state.dependencies.investigations,
            resolved.actor,
            detail.investigation_id,
        )
    return ThreadResponse.from_detail(detail)


@router.post("/threads/{thread_id}/archive", response_model=ThreadResponse)
async def archive_thread(
    thread_id: UUID, request: Request, resolved: AuthenticatedRequest
) -> ThreadResponse:
    try:
        detail = await request.app.state.dependencies.threads.archive(
            resolved.actor, thread_id
        )
    except (PermissionDeniedError, ThreadNotFoundError) as error:
        _thread_error(error)
    return ThreadResponse.from_detail(detail)


@router.post("/threads/{thread_id}/restore", response_model=ThreadResponse)
async def restore_thread(
    thread_id: UUID, request: Request, resolved: AuthenticatedRequest
) -> ThreadResponse:
    try:
        detail = await request.app.state.dependencies.threads.restore(
            resolved.actor, thread_id
        )
    except (
        PermissionDeniedError,
        ThreadNotFoundError,
        ThreadConflictError,
    ) as error:
        _thread_error(error)
    return ThreadResponse.from_detail(detail)


@router.delete("/threads/{thread_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_thread(
    thread_id: UUID, request: Request, resolved: AuthenticatedRequest
) -> None:
    try:
        await request.app.state.dependencies.threads.delete(resolved.actor, thread_id)
    except (
        PermissionDeniedError,
        ThreadNotFoundError,
        ThreadConflictError,
    ) as error:
        _thread_error(error)
