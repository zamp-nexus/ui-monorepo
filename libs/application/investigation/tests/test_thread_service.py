from __future__ import annotations

import base64
import json
from contextlib import AbstractAsyncContextManager
from datetime import UTC, datetime
from uuid import UUID, uuid4

import pytest
from zentra_domain_investigation import (
    ExecutionJob,
    Group,
    Investigation,
    InvestigationThread,
    Project,
    ThreadMessage,
    ThreadStatus,
)

from zentra_application_investigation import (
    AuthenticatedActor,
    PermissionDeniedError,
    Role,
)
from zentra_application_investigation.thread_dto import (
    RoutingDisposition,
    ThreadConflictError,
    ThreadCursor,
    ThreadCursorError,
    ThreadNotFoundError,
    ThreadSlice,
    ThreadSummary,
)
from zentra_application_investigation.thread_routing import (
    deterministic_thread_title,
    route_governed_question,
)
from zentra_application_investigation.thread_service import ThreadService

NOW = datetime(2026, 8, 1, tzinfo=UTC)
TENANT_ID = UUID("20000000-0000-0000-0000-000000000002")
GROUP_ID = UUID("41000000-0000-0000-0000-000000000001")
PROJECT_ID = UUID("42000000-0000-0000-0000-000000000001")


class Repository:
    def __init__(self) -> None:
        self.groups: dict[UUID, Group] = {}
        self.projects: dict[UUID, Project] = {}
        self.threads: dict[UUID, InvestigationThread] = {}
        self.messages: dict[UUID, list[ThreadMessage]] = {}
        self.investigations: dict[UUID, Investigation] = {}
        self.jobs: dict[UUID, ExecutionJob] = {}
        self.enqueued_events = 0
        self.feed_events: dict[UUID, list[object]] = {}
        self.commits = 0

    async def add_thread(self, thread: InvestigationThread) -> None:
        self.threads[thread.thread_id] = thread
        self.messages[thread.thread_id] = []
        self.feed_events[thread.thread_id] = []

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
        include_archived: bool,
        limit: int,
        after: ThreadCursor | None,
    ) -> ThreadSlice:
        del after
        threads = sorted(
            (
                thread
                for thread in self.threads.values()
                if thread.project_id == project_id
                and (include_archived or thread.status is not ThreadStatus.ARCHIVED)
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

    async def get_project(
        self, project_id: UUID, *, for_update: bool = False
    ) -> Project | None:
        return self.projects.get(project_id)

    async def record_project_activity(
        self, project_id: UUID, *, occurred_at: datetime
    ) -> None:
        self.projects[project_id].record_activity(occurred_at)


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
    value.projects[PROJECT_ID] = Project.create(
        project_id=PROJECT_ID,
        tenant_id=TENANT_ID,
        group_id=GROUP_ID,
        name="Forecast",
        now=NOW,
    )
    return value


def service(value: Repository) -> ThreadService:
    return ThreadService(
        unit_of_work_factory=UnitOfWorkFactory(value),
        now=lambda: NOW,
        new_id=uuid4,
    )


@pytest.mark.parametrize(
    ("question", "scenario_key"),
    [
        (
            "Why did EU refunds increase from June to July 2026?",
            "eu_refund_spike",
        ),
        (
            "Explain European refund changes between June and July",
            "eu_refund_spike",
        ),
        (
            "Which North America sales channel drove revenue from Oct to Nov?",
            "na_channel_growth",
        ),
    ],
)
def test_router_resolves_exact_questions_and_paraphrases(
    question: str, scenario_key: str
) -> None:
    result = route_governed_question(question)

    assert result.disposition is RoutingDisposition.RESOLVED
    assert result.scenario_key == scenario_key


def test_router_refuses_ambiguity_and_scenario_key_injection() -> None:
    ambiguous = route_governed_question(
        "EU refunds June July and North America channel revenue October November"
    )
    injected = route_governed_question("eu_refund_spike")

    assert ambiguous.disposition is RoutingDisposition.AMBIGUOUS
    assert injected.disposition is RoutingDisposition.UNSUPPORTED
    assert len(injected.suggestions) == 2


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
async def test_unsupported_first_message_persists_draft_and_clarification_only() -> (
    None
):
    value = repository()

    detail = await service(value).create(
        actor(), project_id=PROJECT_ID, content="How is the business doing?"
    )

    assert detail.status is ThreadStatus.DRAFT
    assert [message.kind.value for message in detail.messages] == [
        "user_question",
        "router_clarification",
    ]
    assert detail.investigation_id is None
    assert value.investigations == {}
    assert value.enqueued_events == 0
    assert value.commits == 1


@pytest.mark.asyncio
async def test_later_clarification_resolves_without_losing_prior_messages() -> None:
    value = repository()
    threads = service(value)
    draft = await threads.create(
        actor(),
        project_id=PROJECT_ID,
        content="Why did refunds increase from June to July?",
    )

    resolved = await threads.append(
        actor(),
        thread_id=draft.thread_id,
        content="In Europe",
    )

    assert resolved.status is ThreadStatus.ACTIVE
    assert resolved.investigation_id is not None
    assert len(resolved.messages) == 3
    investigation = value.investigations[resolved.investigation_id]
    assert investigation.thread_id == draft.thread_id
    assert investigation.initiating_message_id == resolved.messages[-1].message_id
    assert value.enqueued_events == 2
    assert len(value.jobs) == 1
    job = next(iter(value.jobs.values()))
    assert job.investigation_id == investigation.investigation_id


@pytest.mark.asyncio
async def test_active_and_archived_threads_reject_new_messages() -> None:
    value = repository()
    threads = service(value)
    active = await threads.create(
        actor(),
        project_id=PROJECT_ID,
        content="Why did EU refunds increase from June to July?",
    )

    with pytest.raises(ThreadConflictError):
        await threads.append(actor(), thread_id=active.thread_id, content="More")

    await threads.archive(actor(), active.thread_id)
    with pytest.raises(ThreadConflictError):
        await threads.append(actor(), thread_id=active.thread_id, content="More")


@pytest.mark.asyncio
async def test_archived_parent_rejects_thread_creation() -> None:
    value = repository()
    value.groups[GROUP_ID].archive(NOW)

    with pytest.raises(ThreadConflictError):
        await service(value).create(
            actor(), project_id=PROJECT_ID, content="What changed?"
        )


@pytest.mark.asyncio
async def test_viewer_is_read_only_and_missing_thread_is_nondisclosing() -> None:
    value = repository()
    threads = service(value)

    with pytest.raises(PermissionDeniedError):
        await threads.create(
            actor(Role.VIEWER), project_id=PROJECT_ID, content="What changed?"
        )
    with pytest.raises(ThreadNotFoundError):
        await threads.get(actor(Role.VIEWER), uuid4())


@pytest.mark.asyncio
async def test_only_draft_threads_can_be_deleted() -> None:
    value = repository()
    threads = service(value)
    draft = await threads.create(
        actor(), project_id=PROJECT_ID, content="What changed?"
    )
    active = await threads.create(
        actor(),
        project_id=PROJECT_ID,
        content="Why did EU refunds increase from June to July?",
    )

    await threads.delete(actor(), draft.thread_id)
    assert draft.thread_id not in value.threads
    with pytest.raises(ThreadConflictError):
        await threads.delete(actor(), active.thread_id)
