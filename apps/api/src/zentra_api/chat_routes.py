from __future__ import annotations

import json
from collections.abc import AsyncIterator
from typing import Annotated, NoReturn
from uuid import UUID

from fastapi import (
    APIRouter,
    Depends,
    HTTPException,
    Query,
    Request,
    status,
)
from fastapi.responses import StreamingResponse
from zentra_application_analysis_run import (
    PermissionDeniedError,
    ThreadConflictError,
    ThreadCursorError,
    ThreadMessageDetail,
    ThreadNotFoundError,
    ThreadStreamDelta,
    ThreadStreamEvent,
    ThreadStreamMessage,
    ThreadStreamRouting,
    ThreadStreamSnapshot,
)
from zentra_domain_analysis_run import ThreadMessageError, ThreadTransitionError

from .active_connection import (
    AmbiguousDataConnectionError,
    active_data_connection_id,
)
from .request_context import RequestContext, authenticated_context
from .thread_schemas import (
    ChatMessageRequest,
    ChatPageResponse,
    ChatResponse,
    RoutingResponse,
    ThreadMessageResponse,
)

_THREAD_ERRORS = (
    PermissionDeniedError,
    ThreadNotFoundError,
    ThreadConflictError,
    ThreadMessageError,
)

router = APIRouter(prefix="/v1")
AuthenticatedRequest = Annotated[RequestContext, Depends(authenticated_context)]
PageSize = Annotated[int, Query(ge=1, le=100)]
#: A safety net, not the primary signal -- `ThreadEventNotifier` wakes a
#: waiter within milliseconds of the real `pg_notify` on the common path.
#: This only bounds how stale a *missed* notification (a reconnecting
#: listener, a race at startup) is allowed to get.
_EVENT_POLL_INTERVAL_SECONDS = 2.0
_SSE_HEADERS = {"Cache-Control": "no-cache, no-transform", "X-Accel-Buffering": "no"}


async def _active_connection(dependencies: object, actor: object) -> UUID | None:
    """The Data Connection this Thread's Analysis Runs query."""
    try:
        return await active_data_connection_id(
            dependencies.connector,  # type: ignore[attr-defined]
            actor,  # type: ignore[arg-type]
        )
    except AmbiguousDataConnectionError as error:
        raise HTTPException(status_code=409, detail=str(error)) from error


def _error_code(error: Exception) -> tuple[str, int]:
    if isinstance(error, PermissionDeniedError):
        return "permission_denied", status.HTTP_403_FORBIDDEN
    if isinstance(error, ThreadNotFoundError):
        return "thread_not_found", status.HTTP_404_NOT_FOUND
    if isinstance(error, (ThreadConflictError, ThreadTransitionError)):
        return "thread_conflict", status.HTTP_409_CONFLICT
    if isinstance(error, (ThreadMessageError, ThreadCursorError, ValueError)):
        return "invalid_thread", status.HTTP_422_UNPROCESSABLE_ENTITY
    raise error  # pragma: no cover


def _thread_error(error: Exception) -> NoReturn:
    code, status_code = _error_code(error)
    raise HTTPException(
        status_code=status_code,
        detail={"code": code, "message": str(error)},
    ) from error


def _wants_event_stream(request: Request) -> bool:
    """Whether the caller opted into a streaming reply on this same request.

    Defaults to today's single-JSON-body response for anyone who does not
    explicitly ask for `text/event-stream` -- the frontend opts in; any other
    caller (external scripts, tests) keeps working unchanged.
    """
    return "text/event-stream" in request.headers.get("accept", "")


def _sse_frame(event_name: str, payload: object) -> str:
    return f"event: {event_name}\ndata: {json.dumps(payload)}\n\n"


def _message_detail(message: object) -> ThreadMessageDetail:
    return ThreadMessageDetail(
        message_id=message.message_id,  # type: ignore[attr-defined]
        kind=message.kind,  # type: ignore[attr-defined]
        content=message.content,  # type: ignore[attr-defined]
        created_at=message.created_at,  # type: ignore[attr-defined]
        authored_by_user=message.author_id is not None,  # type: ignore[attr-defined]
    )


def _stream_event_frame(event: ThreadStreamEvent) -> str:
    if isinstance(event, ThreadStreamRouting):
        return _sse_frame(
            "routing",
            {
                "thread_id": str(event.thread_id),
                "message_id": str(event.message_id),
                "analysis_run_id": (
                    str(event.analysis_run_id) if event.analysis_run_id else None
                ),
                "routing": RoutingResponse.from_detail(event.routing).model_dump(
                    mode="json"
                ),
            },
        )
    if isinstance(event, ThreadStreamDelta):
        return _sse_frame(
            "delta", {"message_id": str(event.message_id), "text": event.text}
        )
    if isinstance(event, ThreadStreamMessage):
        response = ThreadMessageResponse.from_detail(_message_detail(event.message))
        return _sse_frame("message", response.model_dump(mode="json"))
    if isinstance(event, ThreadStreamSnapshot):
        response = ChatResponse.from_detail(event.detail)
        return _sse_frame("thread", response.model_dump(mode="json"))
    return _sse_frame("error", {"code": "stream_failed", "message": event.message})


async def _thread_stream(
    events: AsyncIterator[ThreadStreamEvent],
) -> AsyncIterator[str]:
    """Frames a Thread stream as SSE, catching domain errors mid-stream.

    Once any frame has been sent the HTTP status is already 200 -- an error
    from here on can only be communicated inside the body, as a terminal
    `error` event, not as an HTTP status code.
    """
    try:
        async for event in events:
            yield _stream_event_frame(event)
    except _THREAD_ERRORS as error:
        code, _ = _error_code(error)
        yield _sse_frame("error", {"code": code, "message": str(error)})


@router.post(
    "/groups/{group_id}/chats",
    response_model=None,
    status_code=status.HTTP_201_CREATED,
)
async def create_chat(
    group_id: UUID,
    body: ChatMessageRequest,
    request: Request,
    resolved: AuthenticatedRequest,
) -> ChatResponse | StreamingResponse:
    dependencies = request.app.state.dependencies
    data_connection_id = await _active_connection(dependencies, resolved.actor)
    if _wants_event_stream(request):
        return StreamingResponse(
            _thread_stream(
                dependencies.threads.create_streaming(
                    resolved.actor,
                    project_id=group_id,
                    content=body.message,
                    data_connection_id=data_connection_id,
                )
            ),
            media_type="text/event-stream",
            headers=_SSE_HEADERS,
        )
    try:
        detail = await dependencies.threads.create(
            resolved.actor,
            project_id=group_id,
            content=body.message,
            data_connection_id=data_connection_id,
        )
    except _THREAD_ERRORS as error:
        _thread_error(error)
    return ChatResponse.from_detail(detail)


@router.get("/groups/{group_id}/chats", response_model=ChatPageResponse)
async def list_chats(
    group_id: UUID,
    request: Request,
    resolved: AuthenticatedRequest,
    limit: PageSize = 50,
    cursor: str | None = None,
    include_archived: bool = False,
) -> ChatPageResponse:
    try:
        detail = await request.app.state.dependencies.threads.list(
            resolved.actor,
            project_id=group_id,
            limit=limit,
            cursor=cursor,
            include_archived=include_archived,
        )
    except (ThreadNotFoundError, ThreadCursorError, ValueError) as error:
        _thread_error(error)
    return ChatPageResponse.from_detail(detail)


@router.get("/chats/{chat_id}", response_model=ChatResponse)
async def get_chat(
    chat_id: UUID, request: Request, resolved: AuthenticatedRequest
) -> ChatResponse:
    try:
        detail = await request.app.state.dependencies.threads.get(
            resolved.actor, chat_id
        )
    except ThreadNotFoundError as error:
        _thread_error(error)
    return ChatResponse.from_detail(detail)


@router.get(
    "/chats/{chat_id}/events",
    response_class=StreamingResponse,
    responses={200: {"content": {"text/event-stream": {}}}},
)
async def stream_chat_events(
    chat_id: UUID,
    request: Request,
    resolved: AuthenticatedRequest,
    after: int | None = Query(default=None, ge=0),
) -> StreamingResponse:
    header_cursor = request.headers.get("last-event-id")
    try:
        cursor = after if after is not None else int(header_cursor or "0")
        await request.app.state.dependencies.threads.event_cursor(
            resolved.actor, chat_id
        )
    except (ThreadNotFoundError, ValueError) as error:
        _thread_error(error)

    async def event_stream() -> AsyncIterator[str]:
        nonlocal cursor
        heartbeat_elapsed = 0.0
        while not await request.is_disconnected():
            events = await request.app.state.dependencies.threads.events(
                resolved.actor,
                thread_id=chat_id,
                after=cursor,
            )
            if events:
                for event in events:
                    cursor = event.sequence
                    yield (
                        f"id: {event.sequence}\n"
                        f"event: {event.kind.value}\n"
                        f"data: {event.model_dump_json()}\n\n"
                    )
                heartbeat_elapsed = 0.0
            else:
                # Woken directly by `ThreadEventNotifier` the instant the
                # Work Feed writer's `pg_notify` (see
                # `PostgresWorkFeedRepository.append`) lands for this thread,
                # rather than sitting out the full interval — the interval
                # below is now only a safety net for a missed or
                # reconnecting notification, not the primary signal.
                await request.app.state.dependencies.thread_events.wait_for(
                    str(chat_id), timeout=_EVENT_POLL_INTERVAL_SECONDS
                )
                heartbeat_elapsed += _EVENT_POLL_INTERVAL_SECONDS
                if heartbeat_elapsed >= 15:
                    yield ": heartbeat\n\n"
                    heartbeat_elapsed = 0.0

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache, no-transform",
            "X-Accel-Buffering": "no",
        },
    )


@router.post("/chats/{chat_id}/messages", response_model=None)
async def append_chat_message(
    chat_id: UUID,
    body: ChatMessageRequest,
    request: Request,
    resolved: AuthenticatedRequest,
) -> ChatResponse | StreamingResponse:
    dependencies = request.app.state.dependencies
    data_connection_id = await _active_connection(dependencies, resolved.actor)
    if _wants_event_stream(request):
        return StreamingResponse(
            _thread_stream(
                dependencies.threads.append_streaming(
                    resolved.actor,
                    thread_id=chat_id,
                    content=body.message,
                    data_connection_id=data_connection_id,
                )
            ),
            media_type="text/event-stream",
            headers=_SSE_HEADERS,
        )
    try:
        detail = await dependencies.threads.append(
            resolved.actor,
            thread_id=chat_id,
            content=body.message,
            data_connection_id=data_connection_id,
        )
    except _THREAD_ERRORS as error:
        _thread_error(error)
    return ChatResponse.from_detail(detail)


@router.post("/chats/{chat_id}/archive", response_model=ChatResponse)
async def archive_chat(
    chat_id: UUID, request: Request, resolved: AuthenticatedRequest
) -> ChatResponse:
    try:
        detail = await request.app.state.dependencies.threads.archive(
            resolved.actor, chat_id
        )
    except (PermissionDeniedError, ThreadNotFoundError) as error:
        _thread_error(error)
    return ChatResponse.from_detail(detail)


@router.post("/chats/{chat_id}/restore", response_model=ChatResponse)
async def restore_chat(
    chat_id: UUID, request: Request, resolved: AuthenticatedRequest
) -> ChatResponse:
    try:
        detail = await request.app.state.dependencies.threads.restore(
            resolved.actor, chat_id
        )
    except (
        PermissionDeniedError,
        ThreadNotFoundError,
        ThreadConflictError,
    ) as error:
        _thread_error(error)
    return ChatResponse.from_detail(detail)


@router.delete("/chats/{chat_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_chat(
    chat_id: UUID, request: Request, resolved: AuthenticatedRequest
) -> None:
    try:
        await request.app.state.dependencies.threads.delete(resolved.actor, chat_id)
    except (
        PermissionDeniedError,
        ThreadNotFoundError,
        ThreadConflictError,
    ) as error:
        _thread_error(error)
