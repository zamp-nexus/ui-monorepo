from __future__ import annotations

import base64
import json
from contextlib import AbstractAsyncContextManager
from datetime import UTC, datetime
from uuid import UUID, uuid4

import pytest
from zentra_domain_investigation import (
    TERMINAL_STATUSES,
    ExecutionJob,
    Group,
    Investigation,
    InvestigationThread,
    ThreadMessage,
    ThreadMessageKind,
    ThreadStatus,
)

from zentra_application_investigation import (
    AuthenticatedActor,
    PermissionDeniedError,
    Role,
)
from zentra_application_investigation.thread_dto import (
    RoutingDisposition,
    RoutingResult,
    ThreadConflictError,
    ThreadCursor,
    ThreadCursorError,
    ThreadNotFoundError,
    ThreadSlice,
    ThreadSummary,
)
from zentra_application_investigation.thread_routing import deterministic_thread_title
from zentra_application_investigation.thread_service import ThreadService

NOW = datetime(2026, 8, 1, tzinfo=UTC)
TENANT_ID = UUID("20000000-0000-0000-0000-000000000002")
GROUP_ID = UUID("41000000-0000-0000-0000-000000000001")


class Repository:
    def __init__(self) -> None:
        self.groups: dict[UUID, Group] = {}
        self.threads: dict[UUID, InvestigationThread] = {}
        self.messages: dict[UUID, list[ThreadMessage]] = {}
        self.investigations: dict[UUID, Investigation] = {}
        self.jobs: dict[UUID, ExecutionJob] = {}
        self.enqueued_events = 0
        self.feed_events: dict[UUID, list[object]] = {}
        self.commits = 0
        # `InvestigationThread` (the domain object) carries neither field --
        # both are raw `chat_sessions` columns not yet modeled there, exactly
        # as the real Postgres adapter stores them. Defaults match the
        # schema's own defaults (`visibility` "shared", `created_by` unset).
        self.visibility: dict[UUID, str] = {}
        self.created_by: dict[UUID, UUID | None] = {}

    async def add_thread(self, thread: InvestigationThread) -> None:
        self.threads[thread.thread_id] = thread
        self.messages[thread.thread_id] = []
        self.feed_events[thread.thread_id] = []
        self.visibility.setdefault(thread.thread_id, "shared")
        self.created_by.setdefault(thread.thread_id, None)

    async def visibility_and_creator(
        self, thread_id: UUID
    ) -> tuple[str, UUID | None] | None:
        if thread_id not in self.threads:
            return None
        return self.visibility[thread_id], self.created_by[thread_id]

    async def get_thread(
        self, thread_id: UUID, *, for_update: bool = False
    ) -> InvestigationThread | None:
        return self.threads.get(thread_id)

    async def save_thread(self, thread: InvestigationThread) -> None:
        self.threads[thread.thread_id] = thread

    async def delete_thread(self, thread_id: UUID) -> None:
        del self.threads[thread_id]
        del self.messages[thread_id]

    async def add_message(self, message: ThreadMessage) -> None:
        self.messages[message.thread_id].append(message)

    async def messages_for_thread(self, thread_id: UUID) -> tuple[ThreadMessage, ...]:
        return tuple(self.messages[thread_id])

    async def list_threads(
        self,
        *,
        project_id: UUID,
        viewer_id: UUID,
        include_archived: bool,
        limit: int,
        after: ThreadCursor | None,
    ) -> ThreadSlice:
        del after

        def visible(thread: InvestigationThread) -> bool:
            return (
                self.visibility[thread.thread_id] != "private"
                or self.created_by[thread.thread_id] == viewer_id
            )

        threads = sorted(
            (
                thread
                for thread in self.threads.values()
                if thread.project_id == project_id
                and (include_archived or thread.status is not ThreadStatus.ARCHIVED)
                and visible(thread)
            ),
            key=lambda value: (value.latest_activity_at, value.thread_id),
            reverse=True,
        )
        summaries = tuple(
            ThreadSummary(
                thread_id=thread.thread_id,
                project_id=thread.project_id,
                title=thread.title,
                status=thread.status,
                latest_activity_at=thread.latest_activity_at,
                investigation_id=next(
                    (
                        investigation.investigation_id
                        for investigation in self.investigations.values()
                        if investigation.thread_id == thread.thread_id
                    ),
                    None,
                ),
            )
            for thread in threads[:limit]
        )
        return ThreadSlice(summaries, None)

    async def investigation_id_for_thread(self, thread_id: UUID) -> UUID | None:
        return next(
            (
                investigation.investigation_id
                for investigation in self.investigations.values()
                if investigation.thread_id == thread_id
            ),
            None,
        )

    async def add(self, investigation: Investigation) -> None:
        self.investigations[investigation.investigation_id] = investigation

    async def get(
        self, investigation_id: UUID, *, for_update: bool = False
    ) -> Investigation | None:
        return self.investigations.get(investigation_id)

    async def latest_for_thread(
        self, thread_id: UUID, *, for_update: bool = False
    ) -> Investigation | None:
        values = sorted(
            (
                value
                for value in self.investigations.values()
                if value.thread_id == thread_id
            ),
            key=lambda value: value.thread_sequence or 0,
            reverse=True,
        )
        return values[0] if values else None

    async def all_for_thread(self, thread_id: UUID) -> tuple[Investigation, ...]:
        return tuple(
            sorted(
                (
                    value
                    for value in self.investigations.values()
                    if value.thread_id == thread_id
                ),
                key=lambda value: value.thread_sequence or 0,
            )
        )

    async def save(
        self, investigation: Investigation, *, expected_version: int
    ) -> None:
        self.investigations[investigation.investigation_id] = investigation

    async def add_job(self, job: ExecutionJob) -> None:
        self.jobs[job.job_id] = job

    async def enqueue(self, events: list[object]) -> None:
        self.enqueued_events += len(events)

    async def append(self, *, thread_id: UUID, **values: object) -> None:
        self.feed_events[thread_id].append(values)

    async def append_for_investigation(
        self, *, investigation_id: UUID, **values: object
    ) -> None:
        investigation = self.investigations[investigation_id]
        assert investigation.thread_id is not None
        await self.append(thread_id=investigation.thread_id, **values)

    async def events_after(
        self, thread_id: UUID, *, after: int, limit: int
    ) -> tuple[object, ...]:
        return tuple(self.feed_events[thread_id][after : after + limit])

    async def latest_sequence(self, thread_id: UUID) -> int:
        return len(self.feed_events[thread_id])

    async def get_group(
        self, group_id: UUID, *, for_update: bool = False
    ) -> Group | None:
        return self.groups.get(group_id)


class UnitOfWork:
    def __init__(self, repository: Repository) -> None:
        self.threads = repository
        self.organization = repository
        self.investigations = repository
        self.jobs = repository
        self.outbox = repository
        self.work_feed = repository
        self.repository = repository

    async def __aenter__(self) -> UnitOfWork:
        return self

    async def __aexit__(self, *args: object) -> None:
        return None

    async def commit(self) -> None:
        self.repository.commits += 1


class UnitOfWorkFactory:
    def __init__(self, repository: Repository) -> None:
        self.repository = repository

    def __call__(
        self, tenant_id: UUID, trace_id: UUID, span_id: UUID
    ) -> AbstractAsyncContextManager[UnitOfWork]:
        return UnitOfWork(self.repository)


class FakeIntake:
    """Resolves exactly what the EU refund fixture question needs.

    A trimmed stand-in for an LLM-based Intake Agent: RESOLVED only when the
    text mentions both a refund and Europe, so a bare first message can stay
    unresolved until a later clarification ("In Europe") completes it —
    exercising the same "resolves without losing prior messages" path a real
    Intake Agent must support.
    """

    async def resolve(
        self,
        question: str,
        *,
        tenant_id: UUID,
        data_connection_id: UUID | None = None,
    ) -> RoutingResult:
        del tenant_id, data_connection_id
        normalized = question.casefold()
        if "hello" in normalized or "thanks" in normalized:
            return RoutingResult(
                disposition=RoutingDisposition.NOT_ANALYTICAL,
                scenario_key=None,
                canonical_question=None,
                clarification=None,
                suggestions=(),
            )
        if "refund" in normalized and ("eu" in normalized or "europe" in normalized):
            return RoutingResult(
                disposition=RoutingDisposition.RESOLVED,
                scenario_key="fake_eu_refund",
                canonical_question=question.strip(),
                clarification=None,
                suggestions=(),
            )
        return RoutingResult(
            disposition=RoutingDisposition.UNSUPPORTED,
            scenario_key=None,
            canonical_question=None,
            clarification="I could not map that message to a governed question.",
            suggestions=(),
        )


class FakeConversational:
    async def reply(self, message: str, *, tenant_id: UUID) -> str:
        del message, tenant_id
        return "Thanks for reaching out!"


def actor(role: Role = Role.MEMBER) -> AuthenticatedActor:
    return AuthenticatedActor(
        user_id=uuid4(),
        tenant_id=TENANT_ID,
        role=role,
        trace_id=uuid4(),
        span_id=uuid4(),
    )


def repository() -> Repository:
    value = Repository()
    value.groups[GROUP_ID] = Group.create(
        group_id=GROUP_ID,
        tenant_id=TENANT_ID,
        name="Finance",
        now=NOW,
    )
    return value


def service(value: Repository) -> ThreadService:
    return ThreadService(
        unit_of_work_factory=UnitOfWorkFactory(value),
        intake=FakeIntake(),
        conversational=FakeConversational(),
        now=lambda: NOW,
        new_id=uuid4,
    )


def test_title_is_deterministic_and_bounded_without_a_model() -> None:
    value = "A" * 200

    assert deterministic_thread_title(value) == deterministic_thread_title(value)
    assert len(deterministic_thread_title(value)) == 80


def test_cursor_rejects_a_timezone_naive_timestamp() -> None:
    payload = base64.urlsafe_b64encode(
        json.dumps(
            {
                "activity_at": "2026-08-01T09:00:00",
                "thread_id": str(uuid4()),
            }
        ).encode()
    ).decode()

    with pytest.raises(ThreadCursorError):
        ThreadCursor.decode(payload)


@pytest.mark.asyncio
async def test_a_resolved_first_message_activates_the_thread_and_queues_work() -> None:
    """A question Intake resolves reaches an active Thread and a queued
    Investigation in one step — no separate confirmation round."""
    value = repository()

    detail = await service(value).create(
        actor(),
        project_id=GROUP_ID,
        content="Why did EU refunds increase from June to July 2026?",
    )

    assert detail.status is ThreadStatus.ACTIVE
    assert [message.kind.value for message in detail.messages] == ["user_question"]
    assert detail.investigation_id is not None
    investigation = value.investigations[detail.investigation_id]
    assert (
        investigation.question
        == "Why did EU refunds increase from June to July 2026?"
    )
    assert len(value.jobs) == 1
    assert value.commits == 1


@pytest.mark.asyncio
async def test_the_first_message_is_the_investigation_initiating_message() -> None:
    """A Thread reaches its Investigation in one step when Intake resolves the
    first message — no separate draft-then-clarify round."""
    value = repository()
    threads = service(value)

    thread = await threads.create(
        actor(),
        project_id=GROUP_ID,
        content="Why did EU refunds increase from June to July?",
    )

    assert thread.status is ThreadStatus.ACTIVE
    assert thread.investigation_id is not None
    assert len(thread.messages) == 1
    investigation = value.investigations[thread.investigation_id]
    assert investigation.thread_id == thread.thread_id
    assert investigation.initiating_message_id == thread.messages[0].message_id
    # `investigation.created` and `investigation.started`, enqueued together.
    assert value.enqueued_events == 2
    job = next(iter(value.jobs.values()))
    assert job.investigation_id == investigation.investigation_id


@pytest.mark.asyncio
async def test_an_archived_thread_rejects_new_messages() -> None:
    value = repository()
    threads = service(value)
    active = await threads.create(
        actor(),
        project_id=GROUP_ID,
        content="Why did EU refunds increase from June to July?",
    )

    await threads.archive(actor(), active.thread_id)
    with pytest.raises(ThreadConflictError):
        await threads.append(actor(), thread_id=active.thread_id, content="More")


@pytest.mark.asyncio
async def test_archived_parent_rejects_thread_creation() -> None:
    value = repository()
    value.groups[GROUP_ID].archive(NOW)

    with pytest.raises(ThreadConflictError):
        await service(value).create(
            actor(), project_id=GROUP_ID, content="What changed?"
        )


@pytest.mark.asyncio
async def test_viewer_is_read_only_and_missing_thread_is_nondisclosing() -> None:
    value = repository()
    threads = service(value)

    with pytest.raises(PermissionDeniedError):
        await threads.create(
            actor(Role.VIEWER), project_id=GROUP_ID, content="What changed?"
        )
    with pytest.raises(ThreadNotFoundError):
        await threads.get(actor(Role.VIEWER), uuid4())


@pytest.mark.asyncio
async def test_a_thread_carrying_analytical_work_cannot_be_deleted() -> None:
    """Deletion is now unreachable for new Threads, and deliberately so.

    Every first message queues an Investigation, so every new Thread carries
    audited agent work from the moment it exists — and work that reached the
    ledger must be archived, never made to vanish. The endpoint stays for
    Draft Threads created before ADR-0023; archive is the path for the rest.
    """
    value = repository()
    threads = service(value)
    thread = await threads.create(
        actor(),
        project_id=GROUP_ID,
        content="Why did EU refunds increase from June to July?",
    )

    with pytest.raises(ThreadConflictError):
        await threads.delete(actor(), thread.thread_id)
    assert thread.thread_id in value.threads


@pytest.mark.asyncio
async def test_a_not_analytical_message_gets_an_assistant_reply_no_investigation() -> (
    None
):
    value = repository()

    detail = await service(value).create(
        actor(), project_id=GROUP_ID, content="Hello there!"
    )

    assert detail.investigation_id is None
    assert len(value.investigations) == 0
    assert len(value.jobs) == 0
    assert [message.kind for message in detail.messages] == [
        ThreadMessageKind.USER_QUESTION,
        ThreadMessageKind.ASSISTANT_REPLY,
    ]
    assert detail.messages[1].content == "Thanks for reaching out!"


@pytest.mark.asyncio
async def test_a_follow_up_not_analytical_also_gets_an_assistant_reply() -> None:
    value = repository()
    threads = service(value)
    detail = await threads.create(
        actor(),
        project_id=GROUP_ID,
        content="Why did EU refunds increase from June to July 2026?",
    )
    assert detail.investigation_id is not None
    first_investigation_id = detail.investigation_id

    follow_up = await threads.append(
        actor(), thread_id=detail.thread_id, content="Thanks, that's helpful!"
    )

    assert follow_up.investigation_id == first_investigation_id
    assert [message.kind for message in follow_up.messages][-1] == (
        ThreadMessageKind.ASSISTANT_REPLY
    )


@pytest.mark.asyncio
async def test_a_follow_up_is_accepted_while_the_prior_run_is_still_active() -> None:
    value = repository()
    threads = service(value)
    detail = await threads.create(
        actor(),
        project_id=GROUP_ID,
        content="Why did EU refunds increase from June to July 2026?",
    )
    assert detail.investigation_id is not None
    first_investigation = value.investigations[detail.investigation_id]
    assert first_investigation.status not in TERMINAL_STATUSES

    follow_up = await threads.append(
        actor(),
        thread_id=detail.thread_id,
        content="What about refunds in Europe specifically?",
    )

    assert follow_up.investigation_id is not None
    assert follow_up.investigation_id != detail.investigation_id
    second_investigation = value.investigations[follow_up.investigation_id]
    assert second_investigation.parent_investigation_id == detail.investigation_id


@pytest.mark.asyncio
async def test_a_follow_up_after_not_analytical_starts_its_own_investigation() -> None:
    """A Thread whose only prior activity was a Conversational Agent reply has
    no Investigation to chain from -- the follow-up must still work."""
    value = repository()
    threads = service(value)
    detail = await threads.create(actor(), project_id=GROUP_ID, content="Hello!")
    assert detail.investigation_id is None

    follow_up = await threads.append(
        actor(),
        thread_id=detail.thread_id,
        content="Why did EU refunds increase from June to July 2026?",
    )

    assert follow_up.investigation_id is not None
    investigation = value.investigations[follow_up.investigation_id]
    assert investigation.parent_investigation_id is None


def _make_private(
    value: Repository, thread_id: UUID, creator: AuthenticatedActor
) -> None:
    value.visibility[thread_id] = "private"
    value.created_by[thread_id] = creator.user_id


@pytest.mark.asyncio
async def test_a_private_thread_is_invisible_to_a_non_creator() -> None:
    value = repository()
    creator = actor()
    other_member = actor()
    threads = service(value)
    detail = await threads.create(creator, project_id=GROUP_ID, content="Hello!")
    _make_private(value, detail.thread_id, creator)

    operations = (
        threads.get(other_member, detail.thread_id),
        threads.append(other_member, thread_id=detail.thread_id, content="Hi"),
        threads.archive(other_member, detail.thread_id),
        threads.restore(other_member, detail.thread_id),
        threads.delete(other_member, detail.thread_id),
    )
    for operation in operations:
        with pytest.raises(ThreadNotFoundError):
            await operation


@pytest.mark.asyncio
async def test_a_private_threads_creator_retains_full_access() -> None:
    value = repository()
    creator = actor()
    threads = service(value)
    detail = await threads.create(creator, project_id=GROUP_ID, content="Hello!")
    _make_private(value, detail.thread_id, creator)

    read_back = await threads.get(creator, detail.thread_id)
    assert read_back.thread_id == detail.thread_id
    follow_up = await threads.append(creator, thread_id=detail.thread_id, content="Hi")
    assert follow_up.thread_id == detail.thread_id


@pytest.mark.asyncio
async def test_a_private_thread_is_excluded_from_another_users_list() -> None:
    value = repository()
    creator = actor()
    other_member = actor()
    threads = service(value)
    private = await threads.create(creator, project_id=GROUP_ID, content="Hello!")
    _make_private(value, private.thread_id, creator)
    shared = await threads.create(
        creator, project_id=GROUP_ID, content="Why did EU refunds increase?"
    )

    creator_page = await threads.list(creator, project_id=GROUP_ID)
    other_page = await threads.list(other_member, project_id=GROUP_ID)

    creator_ids = {item.thread_id for item in creator_page.items}
    other_ids = {item.thread_id for item in other_page.items}
    assert private.thread_id in creator_ids
    assert shared.thread_id in creator_ids
    assert private.thread_id not in other_ids
    assert shared.thread_id in other_ids
