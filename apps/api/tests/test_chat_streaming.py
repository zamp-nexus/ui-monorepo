from __future__ import annotations

from datetime import UTC, datetime
from types import SimpleNamespace
from uuid import UUID

import pytest
from zentra_application_analysis_run import (
    AuthenticatedActor,
    Role,
    RoutingDisposition,
    RoutingResult,
    ThreadDetail,
    ThreadMessageDetail,
    ThreadStreamDelta,
    ThreadStreamError,
    ThreadStreamMessage,
    ThreadStreamRouting,
    ThreadStreamSnapshot,
)
from zentra_domain_analysis_run import ThreadMessage, ThreadMessageKind, ThreadStatus

from zentra_api.chat_routes import append_chat_message, create_chat

GROUP_ID = UUID("50000000-0000-0000-0000-000000000001")
THREAD_ID = UUID("50000000-0000-0000-0000-000000000002")
MESSAGE_ID = UUID("50000000-0000-0000-0000-000000000003")
REPLY_ID = UUID("50000000-0000-0000-0000-000000000004")
ORG_ID = UUID("50000000-0000-0000-0000-000000000005")
NOW = datetime(2026, 8, 4, tzinfo=UTC)

CONVERSATIONAL_ROUTING = RoutingResult(
    disposition=RoutingDisposition.NOT_ANALYTICAL,
    scenario_key=None,
    canonical_question=None,
    clarification=None,
    suggestions=(),
)


def _detail() -> ThreadDetail:
    return ThreadDetail(
        thread_id=THREAD_ID,
        project_id=GROUP_ID,
        title="hi",
        status=ThreadStatus.ACTIVE,
        created_at=NOW,
        updated_at=NOW,
        latest_activity_at=NOW,
        messages=(
            ThreadMessageDetail(
                message_id=MESSAGE_ID,
                kind=ThreadMessageKind.USER_QUESTION,
                content="hi",
                created_at=NOW,
                authored_by_user=True,
            ),
            ThreadMessageDetail(
                message_id=REPLY_ID,
                kind=ThreadMessageKind.ASSISTANT_REPLY,
                content="Hello! How can I help?",
                created_at=NOW,
                authored_by_user=False,
            ),
        ),
        analysis_run_id=None,
        routing=CONVERSATIONAL_ROUTING,
        can_append_message=True,
        can_archive=True,
        can_restore=False,
        can_delete=False,
    )


async def _scripted_stream():
    yield ThreadStreamRouting(
        thread_id=THREAD_ID,
        message_id=MESSAGE_ID,
        analysis_run_id=None,
        routing=CONVERSATIONAL_ROUTING,
    )
    yield ThreadStreamDelta(message_id=REPLY_ID, text="Hello")
    yield ThreadStreamDelta(message_id=REPLY_ID, text="! How can I help?")
    yield ThreadStreamMessage(
        message=ThreadMessage.create(
            message_id=REPLY_ID,
            thread_id=THREAD_ID,
            organization_id=ORG_ID,
            author_id=None,
            kind=ThreadMessageKind.ASSISTANT_REPLY,
            content="Hello! How can I help?",
            now=NOW,
        )
    )
    yield ThreadStreamSnapshot(detail=_detail())


async def _failing_stream():
    yield ThreadStreamRouting(
        thread_id=THREAD_ID,
        message_id=MESSAGE_ID,
        analysis_run_id=None,
        routing=CONVERSATIONAL_ROUTING,
    )
    yield ThreadStreamDelta(message_id=REPLY_ID, text="Hel")
    yield ThreadStreamError(message="every provider failed for conversational")


class Threads:
    def __init__(self, stream) -> None:
        self._stream = stream
        self.create_calls: list[dict[str, object]] = []
        self.append_calls: list[dict[str, object]] = []

    def create_streaming(self, actor: object, **kwargs: object):
        self.create_calls.append(kwargs)
        return self._stream()

    def append_streaming(self, actor: object, **kwargs: object):
        self.append_calls.append(kwargs)
        return self._stream()


class Request:
    def __init__(self, threads: Threads, *, accept: str = "text/event-stream") -> None:
        self.headers = {"accept": accept}
        self.app = SimpleNamespace(
            state=SimpleNamespace(
                dependencies=SimpleNamespace(threads=threads, connector=None)
            )
        )


def _actor() -> AuthenticatedActor:
    return AuthenticatedActor(
        user_id=UUID(int=1),
        organization_id=ORG_ID,
        role=Role.MEMBER,
        trace_id=UUID(int=2),
        span_id=UUID(int=3),
    )


class Body:
    message = "hi"


@pytest.mark.asyncio
async def test_create_chat_streams_routing_deltas_message_and_snapshot() -> None:
    threads = Threads(_scripted_stream)
    request = Request(threads)
    resolved = SimpleNamespace(actor=_actor())

    response = await create_chat(GROUP_ID, Body(), request, resolved)  # type: ignore[arg-type]
    chunks = [chunk async for chunk in response.body_iterator]

    assert len(chunks) == 5
    assert chunks[0].startswith("event: routing\n")
    assert '"analysis_run_id": null' in chunks[0]
    assert chunks[1] == (
        'event: delta\ndata: {"message_id": '
        '"50000000-0000-0000-0000-000000000004", "text": "Hello"}\n\n'
    )
    assert chunks[2].startswith("event: delta\n")
    assert '"text": "! How can I help?"' in chunks[2]
    assert chunks[3].startswith("event: message\n")
    assert '"content": "Hello! How can I help?"' in chunks[3]
    assert chunks[4].startswith("event: thread\n")
    assert '"title": "hi"' in chunks[4]


@pytest.mark.asyncio
async def test_a_mid_stream_failure_yields_a_terminal_error_not_http() -> None:
    """Once frames have already been sent the HTTP status is fixed at 200 --
    a failure after that point can only be communicated inside the body."""
    threads = Threads(_failing_stream)
    request = Request(threads)
    resolved = SimpleNamespace(actor=_actor())

    response = await append_chat_message(THREAD_ID, Body(), request, resolved)  # type: ignore[arg-type]
    chunks = [chunk async for chunk in response.body_iterator]

    assert len(chunks) == 3
    assert chunks[-1].startswith("event: error\n")
    assert "every provider failed" in chunks[-1]


@pytest.mark.asyncio
async def test_no_accept_header_falls_back_to_a_single_json_response() -> None:
    """A caller that never asked for `text/event-stream` keeps today's
    contract -- external scripts and anything else hitting this route
    directly must not silently start receiving SSE framing instead of JSON."""

    class JsonThreads:
        async def create(self, actor: object, **kwargs: object) -> ThreadDetail:
            return _detail()

    request = Request(JsonThreads(), accept="application/json")
    resolved = SimpleNamespace(actor=_actor())

    response = await create_chat(GROUP_ID, Body(), request, resolved)  # type: ignore[arg-type]

    assert response.thread_id == THREAD_ID
    assert response.title == "hi"
