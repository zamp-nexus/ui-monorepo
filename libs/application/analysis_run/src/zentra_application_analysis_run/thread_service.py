from __future__ import annotations

from collections.abc import AsyncIterator, Callable
from datetime import datetime
from uuid import UUID

from zentra_domain_analysis_run import (
    ExecutionJob,
    AnalysisRun,
    AnalysisRunEventPayload,
    AnalysisRunStatus,
    AnalysisRunThread,
    MessageEventPayload,
    RoutingEventPayload,
    ThreadEvent,
    ThreadMessage,
    ThreadMessageKind,
    ThreadStatus,
    ThreadTransitionError,
    WorkFeedEventKind,
)

from .dto import (
    AuditDelivery,
    AuthenticatedActor,
    PermissionDeniedError,
    Role,
    UsageSummary,
)
from .ports import AuditWriter
from .thread_dto import (
    RoutingDisposition,
    RoutingResult,
    ThreadConflictError,
    ThreadCursor,
    ThreadDetail,
    ThreadAnalysisRunSummary,
    ThreadNotFoundError,
    ThreadPage,
    ThreadStreamDelta,
    ThreadStreamError,
    ThreadStreamEvent,
    ThreadStreamMessage,
    ThreadStreamRouting,
    ThreadStreamSnapshot,
)
from .thread_ports import (
    ConversationalPort,
    IntakePort,
    ThreadUnitOfWork,
    ThreadUnitOfWorkFactory,
)
from .thread_routing import deterministic_thread_title
from .thread_snapshot import build_thread_detail, require_group, validate_page_size

DEFAULT_PAGE_SIZE = 50
MAX_PAGE_SIZE = 100
THREAD_MUTATOR_ROLES = frozenset({Role.OWNER, Role.ADMIN, Role.MEMBER})

_ROUTABLE_KINDS = frozenset(
    {ThreadMessageKind.USER_QUESTION, ThreadMessageKind.USER_CLARIFICATION}
)


def _combined_question_text(messages: tuple[ThreadMessage, ...]) -> str:
    """A Draft Thread's user and clarification messages, as one question.

    Intake reasons over text, not tokens, so accumulating a Draft Thread's
    messages into one passage (rather than merging separately-matched token
    sets, as the keyword router did) is what lets a later clarification like
    "In Europe" resolve a question the first message alone could not.
    """
    return "\n".join(
        message.content for message in messages if message.kind in _ROUTABLE_KINDS
    )


class ThreadService:
    def __init__(
        self,
        *,
        unit_of_work_factory: ThreadUnitOfWorkFactory,
        intake: IntakePort,
        conversational: ConversationalPort,
        audit_writer: AuditWriter,
        now: Callable[[], datetime],
        new_id: Callable[[], UUID],
    ) -> None:
        self._unit_of_work_factory = unit_of_work_factory
        self._intake = intake
        self._conversational = conversational
        self._audit_writer = audit_writer
        self._now = now
        self._new_id = new_id

    async def _flush_audit(self, actor: AuthenticatedActor, analysis_run_id: UUID | None) -> None:
        # Fire-and-forget from the caller's perspective: `AnalysisRunService`
        # flushes after every outbox enqueue it makes, and Thread-created
        # AnalysisRuns need the same sweep -- otherwise their audit events
        # sit undelivered forever, since nothing else registers this
        # organization with the delivery coordinator's retry loop.
        if analysis_run_id is None:
            return
        await self._audit_writer.flush(
            organization_id=actor.organization_id,
            analysis_run_id=analysis_run_id,
        )

    async def create(
        self,
        actor: AuthenticatedActor,
        *,
        project_id: UUID,
        content: str,
        data_connection_id: UUID | None = None,
    ) -> ThreadDetail:
        self._require_mutator(actor)
        now = self._now()
        thread_id = self._new_id()
        message_id = self._new_id()
        message = ThreadMessage.create(
            message_id=message_id,
            thread_id=thread_id,
            organization_id=actor.organization_id,
            author_id=actor.user_id,
            kind=ThreadMessageKind.USER_QUESTION,
            content=content,
            now=now,
        )
        routing = await self._intake.resolve(
            message.content,
            organization_id=actor.organization_id,
            data_connection_id=data_connection_id,
        )
        title_source = routing.canonical_question or message.content
        thread = AnalysisRunThread.create(
            thread_id=thread_id,
            organization_id=actor.organization_id,
            project_id=project_id,
            initiating_message_id=message_id,
            title=deterministic_thread_title(title_source),
            now=now,
            created_by=actor.user_id,
        )
        async with self._uow(actor) as unit_of_work:
            await self._require_writable_project(unit_of_work, project_id)
            await unit_of_work.threads.add_thread(thread)
            await unit_of_work.threads.add_message(message)
            await unit_of_work.work_feed.append(
                organization_id=actor.organization_id,
                thread_id=thread_id,
                kind=WorkFeedEventKind.MESSAGE_ADDED,
                payload=MessageEventPayload(
                    message_id=message.message_id,
                    message_kind=message.kind.value,
                ),
                occurred_at=now,
                event_id=self._new_id(),
            )
            analysis_run_id, router_messages = await self._apply_routing(
                unit_of_work,
                actor,
                thread,
                message,
                routing,
                now,
                data_connection_id=data_connection_id,
            )
            await unit_of_work.commit()
        await self._flush_audit(actor, analysis_run_id)
        return build_thread_detail(
            thread,
            (message,) + router_messages,
            analysis_run_id,
            routing,
            actor,
        )

    async def create_workflow_reply(
        self,
        actor: AuthenticatedActor,
        *,
        project_id: UUID,
        content: str,
        reply: str,
    ) -> ThreadDetail:
        """Create a Chat whose reply was produced by a custom Workflow.

        A custom Workflow is not an Analysis Run and therefore cannot create a
        governed Finding. It is still a normal Chat turn: both messages and
        their feed events use the same transaction as every other turn.
        """
        self._require_mutator(actor)
        now = self._now()
        thread_id = self._new_id()
        user_message = ThreadMessage.create(
            message_id=self._new_id(),
            thread_id=thread_id,
            organization_id=actor.organization_id,
            author_id=actor.user_id,
            kind=ThreadMessageKind.USER_QUESTION,
            content=content,
            now=now,
        )
        assistant_message = ThreadMessage.create(
            message_id=self._new_id(),
            thread_id=thread_id,
            organization_id=actor.organization_id,
            author_id=None,
            kind=ThreadMessageKind.ASSISTANT_REPLY,
            content=reply,
            now=now,
        )
        thread = AnalysisRunThread.create(
            thread_id=thread_id,
            organization_id=actor.organization_id,
            project_id=project_id,
            initiating_message_id=user_message.message_id,
            title=deterministic_thread_title(content),
            now=now,
            created_by=actor.user_id,
        )
        thread.activate(now)
        async with self._uow(actor) as unit_of_work:
            await self._require_writable_project(unit_of_work, project_id)
            await unit_of_work.threads.add_thread(thread)
            for message in (user_message, assistant_message):
                await unit_of_work.threads.add_message(message)
                await unit_of_work.work_feed.append(
                    organization_id=actor.organization_id,
                    thread_id=thread_id,
                    kind=WorkFeedEventKind.MESSAGE_ADDED,
                    payload=MessageEventPayload(
                        message_id=message.message_id,
                        message_kind=message.kind.value,
                    ),
                    occurred_at=now,
                    event_id=self._new_id(),
                )
            await unit_of_work.threads.save_thread(thread)
            await unit_of_work.commit()
        return build_thread_detail(
            thread, (user_message, assistant_message), None, None, actor
        )

    async def append_workflow_reply(
        self,
        actor: AuthenticatedActor,
        *,
        thread_id: UUID,
        content: str,
        reply: str,
    ) -> ThreadDetail:
        """Append a custom Workflow turn without creating an Analysis Run."""
        self._require_mutator(actor)
        now = self._now()
        async with self._uow(actor) as unit_of_work:
            thread = self._require_thread(
                await unit_of_work.threads.get_thread(thread_id, for_update=True)
            )
            await self._require_visible(unit_of_work, actor, thread_id)
            await self._require_writable_project(unit_of_work, thread.project_id)
            if thread.status is ThreadStatus.ARCHIVED:
                raise ThreadConflictError("Archived Threads cannot accept messages")
            user_message = ThreadMessage.create(
                message_id=self._new_id(),
                thread_id=thread_id,
                organization_id=actor.organization_id,
                author_id=actor.user_id,
                kind=ThreadMessageKind.USER_QUESTION,
                content=content,
                now=now,
            )
            assistant_message = ThreadMessage.create(
                message_id=self._new_id(),
                thread_id=thread_id,
                organization_id=actor.organization_id,
                author_id=None,
                kind=ThreadMessageKind.ASSISTANT_REPLY,
                content=reply,
                now=now,
            )
            thread.record_message(now)
            for message in (user_message, assistant_message):
                await unit_of_work.threads.add_message(message)
                await unit_of_work.work_feed.append(
                    organization_id=actor.organization_id,
                    thread_id=thread_id,
                    kind=WorkFeedEventKind.MESSAGE_ADDED,
                    payload=MessageEventPayload(
                        message_id=message.message_id,
                        message_kind=message.kind.value,
                    ),
                    occurred_at=now,
                    event_id=self._new_id(),
                )
            await unit_of_work.threads.save_thread(thread)
            await unit_of_work.commit()
            messages = await unit_of_work.threads.messages_for_thread(thread_id)
        return build_thread_detail(thread, messages, None, None, actor)

    async def create_streaming(
        self,
        actor: AuthenticatedActor,
        *,
        project_id: UUID,
        content: str,
        data_connection_id: UUID | None = None,
    ) -> AsyncIterator[ThreadStreamEvent]:
        """Same as `create`, except a NOT_ANALYTICAL reply streams live.

        Routing, the user's message, and the AnalysisRun/router-clarification
        branches all commit exactly as `create` does, in one transaction --
        those never call a model for prose a user reads directly, so there is
        nothing to stream. Only the Conversational reply moves the model call
        outside any transaction; see `_stream_conversational_turn`.
        """
        self._require_mutator(actor)
        now = self._now()
        thread_id = self._new_id()
        message_id = self._new_id()
        message = ThreadMessage.create(
            message_id=message_id,
            thread_id=thread_id,
            organization_id=actor.organization_id,
            author_id=actor.user_id,
            kind=ThreadMessageKind.USER_QUESTION,
            content=content,
            now=now,
        )
        routing = await self._intake.resolve(
            message.content,
            organization_id=actor.organization_id,
            data_connection_id=data_connection_id,
        )
        title_source = routing.canonical_question or message.content
        thread = AnalysisRunThread.create(
            thread_id=thread_id,
            organization_id=actor.organization_id,
            project_id=project_id,
            initiating_message_id=message_id,
            title=deterministic_thread_title(title_source),
            now=now,
            created_by=actor.user_id,
        )
        async with self._uow(actor) as unit_of_work:
            await self._require_writable_project(unit_of_work, project_id)
            await unit_of_work.threads.add_thread(thread)
            await unit_of_work.threads.add_message(message)
            await unit_of_work.work_feed.append(
                organization_id=actor.organization_id,
                thread_id=thread_id,
                kind=WorkFeedEventKind.MESSAGE_ADDED,
                payload=MessageEventPayload(
                    message_id=message.message_id,
                    message_kind=message.kind.value,
                ),
                occurred_at=now,
                event_id=self._new_id(),
            )
            analysis_run_id, router_messages, conversational_content = (
                await self._apply_routing_streaming(
                    unit_of_work,
                    actor,
                    thread,
                    message,
                    routing,
                    now,
                    data_connection_id=data_connection_id,
                )
            )
            await unit_of_work.commit()
        await self._flush_audit(actor, analysis_run_id)

        yield ThreadStreamRouting(
            thread_id=thread_id,
            message_id=message_id,
            analysis_run_id=analysis_run_id,
            routing=routing,
        )

        all_messages = (message,) + router_messages
        if conversational_content is not None:
            async for event in self._stream_conversational_turn(
                actor, thread, conversational_content, routing
            ):
                yield event
                if isinstance(event, ThreadStreamError):
                    return
                if isinstance(event, ThreadStreamMessage):
                    all_messages = all_messages + (event.message,)

        detail = build_thread_detail(
            thread, all_messages, analysis_run_id, routing, actor
        )
        yield ThreadStreamSnapshot(detail=detail)

    async def append(
        self,
        actor: AuthenticatedActor,
        *,
        thread_id: UUID,
        content: str,
        data_connection_id: UUID | None = None,
    ) -> ThreadDetail:
        self._require_mutator(actor)
        now = self._now()
        async with self._uow(actor) as unit_of_work:
            thread = self._require_thread(
                await unit_of_work.threads.get_thread(thread_id, for_update=True)
            )
            await self._require_visible(unit_of_work, actor, thread_id)
            await self._require_writable_project(unit_of_work, thread.project_id)
            if thread.status is ThreadStatus.ARCHIVED:
                raise ThreadConflictError("Archived Threads cannot accept messages")
            if thread.status is ThreadStatus.ACTIVE:
                return await self._append_follow_up(
                    unit_of_work, actor, thread, content, now
                )
            message = ThreadMessage.create(
                message_id=self._new_id(),
                thread_id=thread_id,
                organization_id=actor.organization_id,
                author_id=actor.user_id,
                kind=ThreadMessageKind.USER_CLARIFICATION,
                content=content,
                now=now,
            )
            existing_messages = await unit_of_work.threads.messages_for_thread(
                thread_id
            )
            routing = await self._intake.resolve(
                _combined_question_text(existing_messages + (message,)),
                organization_id=actor.organization_id,
                data_connection_id=data_connection_id,
            )
            thread.record_message(now)
            await unit_of_work.threads.add_message(message)
            await unit_of_work.work_feed.append(
                organization_id=actor.organization_id,
                thread_id=thread_id,
                kind=WorkFeedEventKind.MESSAGE_ADDED,
                payload=MessageEventPayload(
                    message_id=message.message_id,
                    message_kind=message.kind.value,
                ),
                occurred_at=now,
                event_id=self._new_id(),
            )
            analysis_run_id, _ = await self._apply_routing(
                unit_of_work,
                actor,
                thread,
                message,
                routing,
                now,
                data_connection_id=data_connection_id,
            )
            await unit_of_work.threads.save_thread(thread)
            await unit_of_work.commit()
            messages = await unit_of_work.threads.messages_for_thread(thread_id)
            detail = build_thread_detail(
                thread, messages, analysis_run_id, routing, actor
            )
        await self._flush_audit(actor, analysis_run_id)
        return detail

    async def append_streaming(
        self,
        actor: AuthenticatedActor,
        *,
        thread_id: UUID,
        content: str,
        data_connection_id: UUID | None = None,
    ) -> AsyncIterator[ThreadStreamEvent]:
        """Streaming counterpart to `append` -- see `create_streaming`.

        The ACTIVE-thread branch hands off to `_append_follow_up_streaming`
        outside this transaction entirely: that path manages its own two
        transactions around the model call, exactly like `create_streaming`
        does, so nothing here may hold a lock across it.
        """
        self._require_mutator(actor)
        now = self._now()
        is_active: bool
        async with self._uow(actor) as unit_of_work:
            thread = self._require_thread(
                await unit_of_work.threads.get_thread(thread_id, for_update=True)
            )
            await self._require_visible(unit_of_work, actor, thread_id)
            await self._require_writable_project(unit_of_work, thread.project_id)
            if thread.status is ThreadStatus.ARCHIVED:
                raise ThreadConflictError("Archived Threads cannot accept messages")
            is_active = thread.status is ThreadStatus.ACTIVE
            if not is_active:
                message = ThreadMessage.create(
                    message_id=self._new_id(),
                    thread_id=thread_id,
                    organization_id=actor.organization_id,
                    author_id=actor.user_id,
                    kind=ThreadMessageKind.USER_CLARIFICATION,
                    content=content,
                    now=now,
                )
                existing_messages = await unit_of_work.threads.messages_for_thread(
                    thread_id
                )
                routing = await self._intake.resolve(
                    _combined_question_text(existing_messages + (message,)),
                    organization_id=actor.organization_id,
                    data_connection_id=data_connection_id,
                )
                thread.record_message(now)
                await unit_of_work.threads.add_message(message)
                await unit_of_work.work_feed.append(
                    organization_id=actor.organization_id,
                    thread_id=thread_id,
                    kind=WorkFeedEventKind.MESSAGE_ADDED,
                    payload=MessageEventPayload(
                        message_id=message.message_id,
                        message_kind=message.kind.value,
                    ),
                    occurred_at=now,
                    event_id=self._new_id(),
                )
                analysis_run_id, _, conversational_content = (
                    await self._apply_routing_streaming(
                        unit_of_work,
                        actor,
                        thread,
                        message,
                        routing,
                        now,
                        data_connection_id=data_connection_id,
                    )
                )
                await unit_of_work.threads.save_thread(thread)
                await unit_of_work.commit()
                messages = await unit_of_work.threads.messages_for_thread(thread_id)

        if not is_active:
            await self._flush_audit(actor, analysis_run_id)

        if is_active:
            async for event in self._append_follow_up_streaming(
                actor, thread, content, now
            ):
                yield event
            return

        yield ThreadStreamRouting(
            thread_id=thread_id,
            message_id=message.message_id,
            analysis_run_id=analysis_run_id,
            routing=routing,
        )

        if conversational_content is not None:
            async for event in self._stream_conversational_turn(
                actor, thread, conversational_content, routing
            ):
                yield event
                if isinstance(event, ThreadStreamError):
                    return
                if isinstance(event, ThreadStreamMessage):
                    messages = messages + (event.message,)

        detail = build_thread_detail(thread, messages, analysis_run_id, routing, actor)
        yield ThreadStreamSnapshot(detail=detail)

    async def _append_follow_up(
        self,
        unit_of_work: ThreadUnitOfWork,
        actor: AuthenticatedActor,
        thread: AnalysisRunThread,
        content: str,
        now: datetime,
    ) -> ThreadDetail:
        # No longer requires `latest` to have finished (or to exist at all --
        # a Thread whose first message was NOT_ANALYTICAL has no AnalysisRun
        # yet). A follow-up always queues its own Analysis Run, chained to
        # whatever the most recent one is, regardless of its status
        # (ADR-0028): job leasing is per-job, not per-Thread, so nothing
        # downstream assumes only one AnalysisRun runs per Thread at a time.
        latest = await unit_of_work.analysis_runs.latest_for_thread(
            thread.thread_id, for_update=True
        )
        message = ThreadMessage.create(
            message_id=self._new_id(),
            thread_id=thread.thread_id,
            organization_id=actor.organization_id,
            author_id=actor.user_id,
            kind=ThreadMessageKind.USER_QUESTION,
            content=content,
            now=now,
        )
        routing = await self._intake.resolve(
            message.content,
            organization_id=actor.organization_id,
            data_connection_id=latest.data_connection_id if latest else None,
        )
        normalized = message.content.casefold()
        published_reference = any(
            token in normalized
            for token in ("again", "latest", "re-run", "rerun", "same")
        )
        if (
            latest is not None
            and routing.disposition is not RoutingDisposition.RESOLVED
            and published_reference
            and latest.status is AnalysisRunStatus.COMPLETED
        ):
            routing = RoutingResult(
                disposition=RoutingDisposition.RESOLVED,
                scenario_key=latest.scenario_key,
                canonical_question=latest.question,
                clarification=None,
                suggestions=(),
            )
        thread.record_message(now)
        await unit_of_work.threads.add_message(message)
        await unit_of_work.work_feed.append(
            organization_id=actor.organization_id,
            thread_id=thread.thread_id,
            kind=WorkFeedEventKind.MESSAGE_ADDED,
            payload=MessageEventPayload(
                message_id=message.message_id,
                message_kind=message.kind.value,
            ),
            occurred_at=now,
            event_id=self._new_id(),
        )
        analysis_run_id = latest.analysis_run_id if latest else None
        if routing.disposition is RoutingDisposition.NOT_ANALYTICAL:
            await self._conversational_reply(
                unit_of_work, actor, thread, message.content, routing
            )
        elif routing.disposition is RoutingDisposition.RESOLVED:
            assert routing.canonical_question is not None
            follow_up = AnalysisRun.create(
                analysis_run_id=self._new_id(),
                organization_id=actor.organization_id,
                question=routing.canonical_question,
                now=now,
                data_connection_id=latest.data_connection_id if latest else None,
                thread_id=thread.thread_id,
                thread_sequence=(latest.thread_sequence or 0) + 1 if latest else 1,
                initiating_message_id=message.message_id,
                parent_analysis_run_id=latest.analysis_run_id if latest else None,
            )
            follow_up.start(now)
            await unit_of_work.analysis_runs.add(follow_up)
            await unit_of_work.jobs.add_job(
                ExecutionJob.create(
                    job_id=self._new_id(),
                    organization_id=actor.organization_id,
                    analysis_run_id=follow_up.analysis_run_id,
                    now=now,
                )
            )
            await unit_of_work.outbox.enqueue(follow_up.events)
            await unit_of_work.work_feed.append(
                organization_id=actor.organization_id,
                thread_id=thread.thread_id,
                kind=WorkFeedEventKind.ANALYSIS_RUN_QUEUED,
                payload=AnalysisRunEventPayload(
                    analysis_run_id=follow_up.analysis_run_id,
                    status=follow_up.status,
                    parent_analysis_run_id=(
                        latest.analysis_run_id if latest else None
                    ),
                ),
                occurred_at=now,
                event_id=self._new_id(),
            )
            analysis_run_id = follow_up.analysis_run_id
        else:
            router_message = self._router_messages(thread, routing, now)[0]
            await unit_of_work.threads.add_message(router_message)
            await unit_of_work.work_feed.append(
                organization_id=actor.organization_id,
                thread_id=thread.thread_id,
                kind=WorkFeedEventKind.ROUTING_CLARIFICATION,
                payload=RoutingEventPayload(
                    disposition=routing.disposition.value,
                    suggestion_count=len(routing.suggestions),
                ),
                occurred_at=now,
                event_id=self._new_id(),
            )
        await unit_of_work.threads.save_thread(thread)
        await unit_of_work.commit()
        messages = await unit_of_work.threads.messages_for_thread(thread.thread_id)
        await self._flush_audit(actor, analysis_run_id)
        return build_thread_detail(thread, messages, analysis_run_id, routing, actor)

    async def _append_follow_up_streaming(
        self,
        actor: AuthenticatedActor,
        thread: AnalysisRunThread,
        content: str,
        now: datetime,
    ) -> AsyncIterator[ThreadStreamEvent]:
        """Streaming counterpart to `_append_follow_up`.

        Manages its own transaction (unlike `_append_follow_up`, which is
        handed one by its caller): the NOT_ANALYTICAL branch streams a model
        reply between two short transactions, so nothing here may hold a
        lock across that call the way the non-streaming version's caller
        does.
        """
        conversational_content: str | None = None
        async with self._uow(actor) as unit_of_work:
            latest = await unit_of_work.analysis_runs.latest_for_thread(
                thread.thread_id, for_update=True
            )
            message = ThreadMessage.create(
                message_id=self._new_id(),
                thread_id=thread.thread_id,
                organization_id=actor.organization_id,
                author_id=actor.user_id,
                kind=ThreadMessageKind.USER_QUESTION,
                content=content,
                now=now,
            )
            routing = await self._intake.resolve(
                message.content,
                organization_id=actor.organization_id,
                data_connection_id=latest.data_connection_id if latest else None,
            )
            normalized = message.content.casefold()
            published_reference = any(
                token in normalized
                for token in ("again", "latest", "re-run", "rerun", "same")
            )
            if (
                latest is not None
                and routing.disposition is not RoutingDisposition.RESOLVED
                and published_reference
                and latest.status is AnalysisRunStatus.COMPLETED
            ):
                routing = RoutingResult(
                    disposition=RoutingDisposition.RESOLVED,
                    scenario_key=latest.scenario_key,
                    canonical_question=latest.question,
                    clarification=None,
                    suggestions=(),
                )
            thread.record_message(now)
            await unit_of_work.threads.add_message(message)
            await unit_of_work.work_feed.append(
                organization_id=actor.organization_id,
                thread_id=thread.thread_id,
                kind=WorkFeedEventKind.MESSAGE_ADDED,
                payload=MessageEventPayload(
                    message_id=message.message_id,
                    message_kind=message.kind.value,
                ),
                occurred_at=now,
                event_id=self._new_id(),
            )
            analysis_run_id = latest.analysis_run_id if latest else None
            if routing.disposition is RoutingDisposition.NOT_ANALYTICAL:
                conversational_content = message.content
            elif routing.disposition is RoutingDisposition.RESOLVED:
                assert routing.canonical_question is not None
                follow_up = AnalysisRun.create(
                    analysis_run_id=self._new_id(),
                    organization_id=actor.organization_id,
                    question=routing.canonical_question,
                    now=now,
                    data_connection_id=latest.data_connection_id if latest else None,
                    thread_id=thread.thread_id,
                    thread_sequence=(latest.thread_sequence or 0) + 1 if latest else 1,
                    initiating_message_id=message.message_id,
                    parent_analysis_run_id=latest.analysis_run_id if latest else None,
                )
                follow_up.start(now)
                await unit_of_work.analysis_runs.add(follow_up)
                await unit_of_work.jobs.add_job(
                    ExecutionJob.create(
                        job_id=self._new_id(),
                        organization_id=actor.organization_id,
                        analysis_run_id=follow_up.analysis_run_id,
                        now=now,
                    )
                )
                await unit_of_work.outbox.enqueue(follow_up.events)
                await unit_of_work.work_feed.append(
                    organization_id=actor.organization_id,
                    thread_id=thread.thread_id,
                    kind=WorkFeedEventKind.ANALYSIS_RUN_QUEUED,
                    payload=AnalysisRunEventPayload(
                        analysis_run_id=follow_up.analysis_run_id,
                        status=follow_up.status,
                        parent_analysis_run_id=(
                            latest.analysis_run_id if latest else None
                        ),
                    ),
                    occurred_at=now,
                    event_id=self._new_id(),
                )
                analysis_run_id = follow_up.analysis_run_id
            else:
                router_message = self._router_messages(thread, routing, now)[0]
                await unit_of_work.threads.add_message(router_message)
                await unit_of_work.work_feed.append(
                    organization_id=actor.organization_id,
                    thread_id=thread.thread_id,
                    kind=WorkFeedEventKind.ROUTING_CLARIFICATION,
                    payload=RoutingEventPayload(
                        disposition=routing.disposition.value,
                        suggestion_count=len(routing.suggestions),
                    ),
                    occurred_at=now,
                    event_id=self._new_id(),
                )
            await unit_of_work.threads.save_thread(thread)
            await unit_of_work.commit()
            messages = await unit_of_work.threads.messages_for_thread(thread.thread_id)
        await self._flush_audit(actor, analysis_run_id)

        yield ThreadStreamRouting(
            thread_id=thread.thread_id,
            message_id=message.message_id,
            analysis_run_id=analysis_run_id,
            routing=routing,
        )

        if conversational_content is not None:
            async for event in self._stream_conversational_turn(
                actor, thread, conversational_content, routing
            ):
                yield event
                if isinstance(event, ThreadStreamError):
                    return
                if isinstance(event, ThreadStreamMessage):
                    messages = messages + (event.message,)

        detail = build_thread_detail(thread, messages, analysis_run_id, routing, actor)
        yield ThreadStreamSnapshot(detail=detail)

    async def get(self, actor: AuthenticatedActor, thread_id: UUID) -> ThreadDetail:
        async with self._uow(actor) as unit_of_work:
            thread = self._require_thread(
                await unit_of_work.threads.get_thread(thread_id)
            )
            await self._require_visible(unit_of_work, actor, thread_id)
            messages = await unit_of_work.threads.messages_for_thread(thread_id)
            analysis_run_id = await unit_of_work.threads.analysis_run_id_for_thread(
                thread_id
            )
            analysis_runs = await unit_of_work.analysis_runs.all_for_thread(thread_id)
            event_cursor = await unit_of_work.work_feed.latest_sequence(thread_id)
            summaries: list[ThreadAnalysisRunSummary] = []
            for analysis_run in analysis_runs:
                approval = await unit_of_work.approvals.get_for_analysis_run(
                    analysis_run.analysis_run_id
                )
                draft = await unit_of_work.draft_findings.latest_for_analysis_run(
                    analysis_run.analysis_run_id
                )
                citations = await unit_of_work.citations.for_analysis_run(
                    analysis_run.analysis_run_id
                )
                usage = await unit_of_work.agent_executions.usage_for_analysis_run(
                    analysis_run.analysis_run_id
                )
                audit = await unit_of_work.outbox.all_for_analysis_run(
                    analysis_run.analysis_run_id
                )
                summaries.append(
                    ThreadAnalysisRunSummary(
                        analysis_run_id=analysis_run.analysis_run_id,
                        sequence=analysis_run.thread_sequence or 0,
                        status=analysis_run.status,
                        parent_analysis_run_id=analysis_run.parent_analysis_run_id,
                        retry_of_analysis_run_id=(
                            analysis_run.retry_of_analysis_run_id
                        ),
                        created_at=analysis_run.created_at,
                        updated_at=analysis_run.updated_at,
                        question=analysis_run.question,
                        scenario_key=analysis_run.scenario_key,
                        version=analysis_run.version,
                        evaluation_attempts=analysis_run.evaluation_attempts,
                        finished_at=analysis_run.finished_at,
                        finding=analysis_run.finding,
                        draft_finding=draft,
                        outcome=analysis_run.outcome,
                        approval=approval,
                        citations=citations,
                        audit_delivery=(
                            AuditDelivery.PENDING
                            if any(record.dispatched_at is None for record in audit)
                            else AuditDelivery.COMPLETE
                        ),
                        usage=usage,
                        can_decide_approval=(
                            actor.role in {Role.OWNER, Role.ADMIN}
                            and approval is not None
                            and approval.status.value == "pending"
                        ),
                    )
                )
            aggregate_usage = UsageSummary(
                input_tokens=sum(value.usage.input_tokens for value in summaries),
                output_tokens=sum(value.usage.output_tokens for value in summaries),
                cost_usd=sum(
                    (value.usage.cost_usd for value in summaries),
                    start=UsageSummary().cost_usd,
                ),
                latency_ms=sum(value.usage.latency_ms for value in summaries),
            )
        return build_thread_detail(
            thread,
            messages,
            analysis_run_id,
            None,
            actor,
            analysis_runs=analysis_runs,
            analysis_run_summaries=tuple(summaries),
            event_cursor=event_cursor,
            usage=aggregate_usage,
        )

    async def events(
        self,
        actor: AuthenticatedActor,
        *,
        thread_id: UUID,
        after: int,
        limit: int = 500,
    ) -> tuple[ThreadEvent, ...]:
        if after < 0 or limit < 1 or limit > 500:
            raise ValueError("Work Feed cursor or limit is invalid")
        async with self._uow(actor) as unit_of_work:
            self._require_thread(await unit_of_work.threads.get_thread(thread_id))
            return await unit_of_work.work_feed.events_after(
                thread_id, after=after, limit=limit
            )

    async def event_cursor(self, actor: AuthenticatedActor, thread_id: UUID) -> int:
        async with self._uow(actor) as unit_of_work:
            self._require_thread(await unit_of_work.threads.get_thread(thread_id))
            return await unit_of_work.work_feed.latest_sequence(thread_id)

    async def list(
        self,
        actor: AuthenticatedActor,
        *,
        project_id: UUID,
        include_archived: bool = False,
        limit: int = DEFAULT_PAGE_SIZE,
        cursor: str | None = None,
    ) -> ThreadPage:
        limit = validate_page_size(limit, MAX_PAGE_SIZE)
        after = ThreadCursor.decode(cursor) if cursor else None
        async with self._uow(actor) as unit_of_work:
            require_group(await unit_of_work.groups.get_group(project_id))
            page = await unit_of_work.threads.list_threads(
                project_id=project_id,
                viewer_id=actor.user_id,
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

    async def rename(self, actor: AuthenticatedActor, thread_id: UUID, *, title: str) -> ThreadDetail:
        self._require_mutator(actor)
        async with self._uow(actor) as unit_of_work:
            thread = self._require_thread(
                await unit_of_work.threads.get_thread(thread_id, for_update=True)
            )
            await self._require_visible(unit_of_work, actor, thread_id)
            thread.rename(title, self._now())
            await unit_of_work.threads.update_thread(thread)
            await unit_of_work.commit()
            return await self._detail_for_thread(unit_of_work, thread, actor)

    async def delete(self, actor: AuthenticatedActor, thread_id: UUID) -> None:
        self._require_mutator(actor)
        async with self._uow(actor) as unit_of_work:
            thread = self._require_thread(
                await unit_of_work.threads.get_thread(thread_id, for_update=True)
            )
            await self._require_visible(unit_of_work, actor, thread_id)
            analysis_run_id = await unit_of_work.threads.analysis_run_id_for_thread(
                thread_id
            )
            try:
                thread.ensure_deletable(
                    has_analytical_work=analysis_run_id is not None
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
            await self._require_visible(unit_of_work, actor, thread_id)
            if restore:
                await self._require_writable_project(unit_of_work, thread.project_id)
                thread.restore(now)
            else:
                thread.archive(now)
            await unit_of_work.threads.save_thread(thread)
            await unit_of_work.commit()
            messages = await unit_of_work.threads.messages_for_thread(thread_id)
            analysis_run_id = await unit_of_work.threads.analysis_run_id_for_thread(
                thread_id
            )
        return build_thread_detail(thread, messages, analysis_run_id, None, actor)

    async def _apply_routing(
        self,
        unit_of_work: ThreadUnitOfWork,
        actor: AuthenticatedActor,
        thread: AnalysisRunThread,
        message: ThreadMessage,
        routing: RoutingResult,
        now: datetime,
        data_connection_id: UUID | None = None,
    ) -> tuple[UUID | None, tuple[ThreadMessage, ...]]:
        if routing.disposition is RoutingDisposition.NOT_ANALYTICAL:
            # Activated, not left in Draft: unlike Ambiguous/Unsupported, a
            # Conversational Agent reply is a complete exchange, not a request
            # for more detail about the same question. Leaving the Thread in
            # Draft would make the next message's routing re-combine it with
            # this one via `_combined_question_text`, which is wrong for an
            # ordinary greeting followed by an unrelated real question.
            thread.title = deterministic_thread_title(message.content)
            thread.activate(now)
            await unit_of_work.threads.save_thread(thread)
            reply_message = await self._conversational_reply(
                unit_of_work, actor, thread, message.content, routing
            )
            return None, (reply_message,)
        if routing.disposition is not RoutingDisposition.RESOLVED:
            router_messages = self._router_messages(thread, routing, now)
            await unit_of_work.threads.add_message(router_messages[0])
            await unit_of_work.work_feed.append(
                organization_id=actor.organization_id,
                thread_id=thread.thread_id,
                kind=WorkFeedEventKind.ROUTING_CLARIFICATION,
                payload=RoutingEventPayload(
                    disposition=routing.disposition.value,
                    suggestion_count=len(routing.suggestions),
                ),
                occurred_at=now,
                event_id=self._new_id(),
            )
            return None, router_messages
        assert routing.canonical_question is not None
        analysis_run = AnalysisRun.create(
            analysis_run_id=self._new_id(),
            organization_id=actor.organization_id,
            question=routing.canonical_question,
            now=now,
            # Which data the question is asked against. Absent means the demo
            # warehouse, which is right only for an organization that has connected
            # nothing — see `active_connection.py`.
            data_connection_id=data_connection_id,
            thread_id=thread.thread_id,
            thread_sequence=1,
            initiating_message_id=message.message_id,
        )
        analysis_run.start(now)
        job = ExecutionJob.create(
            job_id=self._new_id(),
            organization_id=actor.organization_id,
            analysis_run_id=analysis_run.analysis_run_id,
            now=now,
        )
        thread.title = deterministic_thread_title(routing.canonical_question)
        thread.activate(now)
        await unit_of_work.analysis_runs.add(analysis_run)
        await unit_of_work.jobs.add_job(job)
        await unit_of_work.outbox.enqueue(analysis_run.events)
        await unit_of_work.threads.save_thread(thread)
        await unit_of_work.work_feed.append(
            organization_id=actor.organization_id,
            thread_id=thread.thread_id,
            kind=WorkFeedEventKind.ROUTING_RESOLVED,
            payload=RoutingEventPayload(disposition=routing.disposition.value),
            occurred_at=now,
            event_id=self._new_id(),
        )
        await unit_of_work.work_feed.append(
            organization_id=actor.organization_id,
            thread_id=thread.thread_id,
            kind=WorkFeedEventKind.ANALYSIS_RUN_QUEUED,
            payload=AnalysisRunEventPayload(
                analysis_run_id=analysis_run.analysis_run_id,
                status="queued",
            ),
            occurred_at=now,
            event_id=self._new_id(),
        )
        return analysis_run.analysis_run_id, ()

    async def _apply_routing_streaming(
        self,
        unit_of_work: ThreadUnitOfWork,
        actor: AuthenticatedActor,
        thread: AnalysisRunThread,
        message: ThreadMessage,
        routing: RoutingResult,
        now: datetime,
        data_connection_id: UUID | None = None,
    ) -> tuple[UUID | None, tuple[ThreadMessage, ...], str | None]:
        """Streaming counterpart to `_apply_routing`.

        Identical for every disposition except NOT_ANALYTICAL: instead of
        generating and persisting the reply inline (which would hold this
        transaction open for the whole model call), it activates the Thread
        and returns the content to stream, leaving the reply itself to
        `_stream_conversational_turn` once this transaction has committed.
        """
        if routing.disposition is RoutingDisposition.NOT_ANALYTICAL:
            thread.title = deterministic_thread_title(message.content)
            thread.activate(now)
            await unit_of_work.threads.save_thread(thread)
            return None, (), message.content
        if routing.disposition is not RoutingDisposition.RESOLVED:
            router_messages = self._router_messages(thread, routing, now)
            await unit_of_work.threads.add_message(router_messages[0])
            await unit_of_work.work_feed.append(
                organization_id=actor.organization_id,
                thread_id=thread.thread_id,
                kind=WorkFeedEventKind.ROUTING_CLARIFICATION,
                payload=RoutingEventPayload(
                    disposition=routing.disposition.value,
                    suggestion_count=len(routing.suggestions),
                ),
                occurred_at=now,
                event_id=self._new_id(),
            )
            return None, router_messages, None
        assert routing.canonical_question is not None
        analysis_run = AnalysisRun.create(
            analysis_run_id=self._new_id(),
            organization_id=actor.organization_id,
            question=routing.canonical_question,
            now=now,
            data_connection_id=data_connection_id,
            thread_id=thread.thread_id,
            thread_sequence=1,
            initiating_message_id=message.message_id,
        )
        analysis_run.start(now)
        job = ExecutionJob.create(
            job_id=self._new_id(),
            organization_id=actor.organization_id,
            analysis_run_id=analysis_run.analysis_run_id,
            now=now,
        )
        thread.title = deterministic_thread_title(routing.canonical_question)
        thread.activate(now)
        await unit_of_work.analysis_runs.add(analysis_run)
        await unit_of_work.jobs.add_job(job)
        await unit_of_work.outbox.enqueue(analysis_run.events)
        await unit_of_work.threads.save_thread(thread)
        await unit_of_work.work_feed.append(
            organization_id=actor.organization_id,
            thread_id=thread.thread_id,
            kind=WorkFeedEventKind.ROUTING_RESOLVED,
            payload=RoutingEventPayload(disposition=routing.disposition.value),
            occurred_at=now,
            event_id=self._new_id(),
        )
        await unit_of_work.work_feed.append(
            organization_id=actor.organization_id,
            thread_id=thread.thread_id,
            kind=WorkFeedEventKind.ANALYSIS_RUN_QUEUED,
            payload=AnalysisRunEventPayload(
                analysis_run_id=analysis_run.analysis_run_id,
                status="queued",
            ),
            occurred_at=now,
            event_id=self._new_id(),
        )
        return analysis_run.analysis_run_id, (), None

    async def _conversational_reply(
        self,
        unit_of_work: ThreadUnitOfWork,
        actor: AuthenticatedActor,
        thread: AnalysisRunThread,
        content: str,
        routing: RoutingResult,
    ) -> ThreadMessage:
        reply_text = await self._conversational.reply(
            content, organization_id=actor.organization_id
        )
        # Re-derive `now` after the model call returns -- the caller's `now`
        # is the turn's start time, and stamping the reply with it can tie
        # (or even precede) the question it answers once the DB's tiebreak
        # falls back to a random message id.
        reply_now = self._now()
        reply_message = ThreadMessage.create(
            message_id=self._new_id(),
            thread_id=thread.thread_id,
            organization_id=thread.organization_id,
            author_id=None,
            kind=ThreadMessageKind.ASSISTANT_REPLY,
            content=reply_text,
            now=reply_now,
        )
        await unit_of_work.threads.add_message(reply_message)
        await unit_of_work.work_feed.append(
            organization_id=actor.organization_id,
            thread_id=thread.thread_id,
            kind=WorkFeedEventKind.ROUTING_CLARIFICATION,
            payload=RoutingEventPayload(
                disposition=routing.disposition.value,
                suggestion_count=0,
            ),
            occurred_at=reply_now,
            event_id=self._new_id(),
        )
        return reply_message

    async def _stream_conversational_turn(
        self,
        actor: AuthenticatedActor,
        thread: AnalysisRunThread,
        content: str,
        routing: RoutingResult,
    ) -> AsyncIterator[ThreadStreamEvent]:
        """Streams a Conversational reply with no transaction open.

        Yields `ThreadStreamDelta` events as the model produces them, then
        exactly one terminal event: `ThreadStreamMessage` on success (the
        reply persisted in its own short transaction, opened only after the
        model call has finished) or `ThreadStreamError` if the model failed
        after streaming had already begun — never silently retried; see
        `RoutedModelClient.stream`.
        """
        reply_message_id = self._new_id()
        chunks: list[str] = []
        try:
            async for chunk in self._conversational.reply_stream(
                content, organization_id=actor.organization_id
            ):
                if not chunk:
                    continue
                chunks.append(chunk)
                yield ThreadStreamDelta(message_id=reply_message_id, text=chunk)
        except Exception as error:  # noqa: BLE001 - surfaced as a typed terminal event
            yield ThreadStreamError(message=str(error))
            return

        # The turn-start `now` is stale by the time streaming finishes -- a
        # reply stamped with it can tie (or even precede) the question it
        # answers once the DB's tiebreak falls back to a random message id.
        reply_now = self._now()
        reply_message = ThreadMessage.create(
            message_id=reply_message_id,
            thread_id=thread.thread_id,
            organization_id=thread.organization_id,
            author_id=None,
            kind=ThreadMessageKind.ASSISTANT_REPLY,
            content="".join(chunks),
            now=reply_now,
        )
        async with self._uow(actor) as unit_of_work:
            await unit_of_work.threads.add_message(reply_message)
            await unit_of_work.work_feed.append(
                organization_id=actor.organization_id,
                thread_id=thread.thread_id,
                kind=WorkFeedEventKind.ROUTING_CLARIFICATION,
                payload=RoutingEventPayload(
                    disposition=routing.disposition.value,
                    suggestion_count=0,
                ),
                occurred_at=reply_now,
                event_id=self._new_id(),
            )
            await unit_of_work.commit()
        yield ThreadStreamMessage(message=reply_message)

    def _router_messages(
        self,
        thread: AnalysisRunThread,
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
                organization_id=thread.organization_id,
                author_id=None,
                kind=ThreadMessageKind.ROUTER_CLARIFICATION,
                content=f"{routing.clarification}\n{suggestions}",
                now=now,
            ),
        )

    async def _require_writable_project(
        self, unit_of_work: ThreadUnitOfWork, project_id: UUID
    ) -> None:
        # `project_id` names a Group directly now -- Groups own Chat Sessions
        # directly, with no Project layer between them (ADR-0028).
        group = require_group(await unit_of_work.groups.get_group(project_id))
        if group.archived_at is not None:
            raise ThreadConflictError("Archived Groups cannot accept Thread messages")

    async def _require_visible(
        self, unit_of_work: ThreadUnitOfWork, actor: AuthenticatedActor, thread_id: UUID
    ) -> None:
        # Application-layer filter, not a second RLS policy (ADR-0033): every
        # existing RLS policy in this codebase is tenant-scoped only, and a
        # `created_by`-scoped policy would need a second session variable set
        # on every connection for the sake of one table. Raises the same
        # error a nonexistent or cross-Tenant Thread would -- a private
        # Thread another User cannot see should look identical to one that
        # does not exist, not confirm its existence via a different error.
        visibility = await unit_of_work.threads.visibility_and_creator(thread_id)
        if visibility is None:
            return
        session_visibility, created_by = visibility
        if session_visibility == "private" and created_by != actor.user_id:
            raise ThreadNotFoundError("Thread was not found")

    def _uow(self, actor: AuthenticatedActor):
        return self._unit_of_work_factory(
            actor.organization_id, actor.trace_id, actor.span_id
        )

    @staticmethod
    def _require_mutator(actor: AuthenticatedActor) -> None:
        if actor.role not in THREAD_MUTATOR_ROLES:
            raise PermissionDeniedError("This membership cannot change Threads")

    @staticmethod
    def _require_thread(thread: AnalysisRunThread | None) -> AnalysisRunThread:
        if thread is None:
            raise ThreadNotFoundError("Thread was not found")
        return thread
