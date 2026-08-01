from __future__ import annotations

from collections.abc import Callable
from datetime import datetime
from uuid import UUID

from zentra_domain_investigation import (
    ExecutionJob,
    Investigation,
    InvestigationThread,
    Project,
    ThreadMessage,
    ThreadMessageKind,
    ThreadStatus,
    ThreadTransitionError,
)

from .dto import AuthenticatedActor, PermissionDeniedError, Role
from .thread_dto import (
    RoutingDisposition,
    RoutingResult,
    ThreadConflictError,
    ThreadCursor,
    ThreadDetail,
    ThreadMessageDetail,
    ThreadNotFoundError,
    ThreadPage,
)
from .thread_ports import ThreadUnitOfWork, ThreadUnitOfWorkFactory
from .thread_routing import (
    deterministic_thread_title,
    route_draft_messages,
    route_governed_question,
)

DEFAULT_PAGE_SIZE = 50
MAX_PAGE_SIZE = 100
THREAD_MUTATOR_ROLES = frozenset({Role.OWNER, Role.ADMIN, Role.MEMBER})


class ThreadService:
    def __init__(
        self,
        *,
        unit_of_work_factory: ThreadUnitOfWorkFactory,
        now: Callable[[], datetime],
        new_id: Callable[[], UUID],
    ) -> None:
        self._unit_of_work_factory = unit_of_work_factory
        self._now = now
        self._new_id = new_id

    async def create(
        self, actor: AuthenticatedActor, *, project_id: UUID, content: str
    ) -> ThreadDetail:
        self._require_mutator(actor)
        now = self._now()
        thread_id = self._new_id()
        message_id = self._new_id()
        message = ThreadMessage.create(
            message_id=message_id,
            thread_id=thread_id,
            tenant_id=actor.tenant_id,
            author_id=actor.user_id,
            kind=ThreadMessageKind.USER_QUESTION,
            content=content,
            now=now,
        )
        routing = route_governed_question(message.content)
        title_source = routing.canonical_question or message.content
        thread = InvestigationThread.create(
            thread_id=thread_id,
            tenant_id=actor.tenant_id,
            project_id=project_id,
            initiating_message_id=message_id,
            title=deterministic_thread_title(title_source),
            now=now,
        )
        async with self._uow(actor) as unit_of_work:
            await self._require_writable_project(unit_of_work, project_id)
            await unit_of_work.threads.add_thread(thread)
            await unit_of_work.threads.add_message(message)
            investigation_id, router_messages = await self._apply_routing(
                unit_of_work, actor, thread, message, routing, now
            )
            await unit_of_work.organization.record_project_activity(
                project_id, occurred_at=now
            )
            await unit_of_work.commit()
        return self._detail(
            thread,
            (message,) + router_messages,
            investigation_id,
            routing,
            actor,
        )

    async def append(
        self, actor: AuthenticatedActor, *, thread_id: UUID, content: str
    ) -> ThreadDetail:
        self._require_mutator(actor)
        now = self._now()
        async with self._uow(actor) as unit_of_work:
            thread = self._require_thread(
                await unit_of_work.threads.get_thread(thread_id, for_update=True)
            )
            await self._require_writable_project(unit_of_work, thread.project_id)
            if thread.status is not ThreadStatus.DRAFT:
                raise ThreadConflictError(
                    "Only Draft Threads can accept routing clarifications"
                )
            message = ThreadMessage.create(
                message_id=self._new_id(),
                thread_id=thread_id,
                tenant_id=actor.tenant_id,
                author_id=actor.user_id,
                kind=ThreadMessageKind.USER_CLARIFICATION,
                content=content,
                now=now,
            )
            existing_messages = await unit_of_work.threads.messages_for_thread(
                thread_id
            )
            routing = route_draft_messages(existing_messages + (message,))
            thread.record_message(now)
            await unit_of_work.threads.add_message(message)
            investigation_id, _ = await self._apply_routing(
                unit_of_work, actor, thread, message, routing, now
            )
            await unit_of_work.threads.save_thread(thread)
            await unit_of_work.organization.record_project_activity(
                thread.project_id, occurred_at=now
            )
            await unit_of_work.commit()
            messages = await unit_of_work.threads.messages_for_thread(thread_id)
        return self._detail(thread, messages, investigation_id, routing, actor)

    async def get(self, actor: AuthenticatedActor, thread_id: UUID) -> ThreadDetail:
        async with self._uow(actor) as unit_of_work:
            thread = self._require_thread(
                await unit_of_work.threads.get_thread(thread_id)
            )
            messages = await unit_of_work.threads.messages_for_thread(thread_id)
            investigation_id = await unit_of_work.threads.investigation_id_for_thread(
                thread_id
            )
        return self._detail(thread, messages, investigation_id, None, actor)

    async def list(
        self,
        actor: AuthenticatedActor,
        *,
        project_id: UUID,
        include_archived: bool = False,
        limit: int = DEFAULT_PAGE_SIZE,
        cursor: str | None = None,
    ) -> ThreadPage:
        limit = self._page_size(limit)
        after = ThreadCursor.decode(cursor) if cursor else None
        async with self._uow(actor) as unit_of_work:
            self._require_project(
                await unit_of_work.organization.get_project(project_id)
            )
            page = await unit_of_work.threads.list_threads(
                project_id=project_id,
                include_archived=include_archived,
                limit=limit,
                after=after,
            )
        return ThreadPage(
            items=page.items,
            next_cursor=page.next_cursor.encode() if page.next_cursor else None,
        )

    async def archive(self, actor: AuthenticatedActor, thread_id: UUID) -> ThreadDetail:
        self._require_mutator(actor)
        return await self._change_status(actor, thread_id, restore=False)

    async def restore(self, actor: AuthenticatedActor, thread_id: UUID) -> ThreadDetail:
        self._require_mutator(actor)
        return await self._change_status(actor, thread_id, restore=True)

    async def delete(self, actor: AuthenticatedActor, thread_id: UUID) -> None:
        self._require_mutator(actor)
        async with self._uow(actor) as unit_of_work:
            thread = self._require_thread(
                await unit_of_work.threads.get_thread(thread_id, for_update=True)
            )
            investigation_id = await unit_of_work.threads.investigation_id_for_thread(
                thread_id
            )
            try:
                thread.ensure_deletable(
                    has_analytical_work=investigation_id is not None
                )
            except ThreadTransitionError as error:
                raise ThreadConflictError(str(error)) from error
            await unit_of_work.threads.delete_thread(thread_id)
            await unit_of_work.commit()

    async def _change_status(
        self, actor: AuthenticatedActor, thread_id: UUID, *, restore: bool
    ) -> ThreadDetail:
        now = self._now()
        async with self._uow(actor) as unit_of_work:
            thread = self._require_thread(
                await unit_of_work.threads.get_thread(thread_id, for_update=True)
            )
            if restore:
                await self._require_writable_project(unit_of_work, thread.project_id)
                thread.restore(now)
            else:
                thread.archive(now)
            await unit_of_work.threads.save_thread(thread)
            await unit_of_work.commit()
            messages = await unit_of_work.threads.messages_for_thread(thread_id)
            investigation_id = await unit_of_work.threads.investigation_id_for_thread(
                thread_id
            )
        return self._detail(thread, messages, investigation_id, None, actor)

    async def _apply_routing(
        self,
        unit_of_work: ThreadUnitOfWork,
        actor: AuthenticatedActor,
        thread: InvestigationThread,
        message: ThreadMessage,
        routing: RoutingResult,
        now: datetime,
    ) -> tuple[UUID | None, tuple[ThreadMessage, ...]]:
        if routing.disposition is not RoutingDisposition.RESOLVED:
            router_messages = self._router_messages(thread, routing, now)
            await unit_of_work.threads.add_message(router_messages[0])
            return None, router_messages
        assert routing.scenario_key is not None
        assert routing.canonical_question is not None
        investigation = Investigation.create(
            investigation_id=self._new_id(),
            tenant_id=actor.tenant_id,
            question=routing.canonical_question,
            scenario_key=routing.scenario_key,
            now=now,
            thread_id=thread.thread_id,
            thread_sequence=1,
            initiating_message_id=message.message_id,
        )
        investigation.start(now)
        job = ExecutionJob.create(
            job_id=self._new_id(),
            tenant_id=actor.tenant_id,
            investigation_id=investigation.investigation_id,
            now=now,
        )
        thread.title = deterministic_thread_title(routing.canonical_question)
        thread.activate(now)
        await unit_of_work.investigations.add(investigation)
        await unit_of_work.jobs.add_job(job)
        await unit_of_work.outbox.enqueue(investigation.events)
        await unit_of_work.threads.save_thread(thread)
        return investigation.investigation_id, ()

    def _router_messages(
        self,
        thread: InvestigationThread,
        routing: RoutingResult,
        now: datetime,
    ) -> tuple[ThreadMessage, ...]:
        if routing.clarification is None:
            return ()
        suggestions = "\n".join(f"- {question}" for question in routing.suggestions)
        return (
            ThreadMessage.create(
                message_id=self._new_id(),
                thread_id=thread.thread_id,
                tenant_id=thread.tenant_id,
                author_id=None,
                kind=ThreadMessageKind.ROUTER_CLARIFICATION,
                content=f"{routing.clarification}\n{suggestions}",
                now=now,
            ),
        )

    async def _require_writable_project(
        self, unit_of_work: ThreadUnitOfWork, project_id: UUID
    ) -> None:
        project = self._require_project(
            await unit_of_work.organization.get_project(project_id)
        )
        group = await unit_of_work.organization.get_group(project.group_id)
        if group is None:
            raise ThreadNotFoundError("Project was not found")
        if project.archived_at is not None or group.archived_at is not None:
            raise ThreadConflictError(
                "Archived Groups and Projects cannot accept Thread messages"
            )

    def _uow(self, actor: AuthenticatedActor):
        return self._unit_of_work_factory(
            actor.tenant_id, actor.trace_id, actor.span_id
        )

    @staticmethod
    def _require_mutator(actor: AuthenticatedActor) -> None:
        if actor.role not in THREAD_MUTATOR_ROLES:
            raise PermissionDeniedError("This membership cannot change Threads")

    @staticmethod
    def _require_thread(thread: InvestigationThread | None) -> InvestigationThread:
        if thread is None:
            raise ThreadNotFoundError("Thread was not found")
        return thread

    @staticmethod
    def _require_project(project: Project | None) -> Project:
        if project is None:
            raise ThreadNotFoundError("Project was not found")
        return project

    @staticmethod
    def _page_size(limit: int) -> int:
        if limit < 1 or limit > MAX_PAGE_SIZE:
            raise ValueError(f"Page size must be between 1 and {MAX_PAGE_SIZE}")
        return limit

    @staticmethod
    def _detail(
        thread: InvestigationThread,
        messages: tuple[ThreadMessage, ...],
        investigation_id: UUID | None,
        routing: RoutingResult | None,
        actor: AuthenticatedActor,
    ) -> ThreadDetail:
        can_mutate = actor.role in THREAD_MUTATOR_ROLES
        is_archived = thread.status is ThreadStatus.ARCHIVED
        return ThreadDetail(
            thread_id=thread.thread_id,
            project_id=thread.project_id,
            title=thread.title,
            status=thread.status,
            created_at=thread.created_at,
            updated_at=thread.updated_at,
            latest_activity_at=thread.latest_activity_at,
            messages=tuple(
                ThreadMessageDetail(
                    message_id=message.message_id,
                    kind=message.kind,
                    content=message.content,
                    created_at=message.created_at,
                    authored_by_user=message.author_id is not None,
                )
                for message in messages
            ),
            investigation_id=investigation_id,
            routing=routing,
            can_append_message=(can_mutate and thread.status is ThreadStatus.DRAFT),
            can_archive=can_mutate and not is_archived,
            can_restore=can_mutate and is_archived,
            can_delete=(
                can_mutate
                and thread.status is ThreadStatus.DRAFT
                and investigation_id is None
            ),
        )
