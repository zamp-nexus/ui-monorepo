from __future__ import annotations

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from typing import Any
from uuid import UUID

from sqlalchemy import delete, insert, or_, select, tuple_, update
from sqlalchemy.ext.asyncio import AsyncConnection
from zentra_application_analysis_run import (
    ThreadCursor,
    ThreadSlice,
    ThreadSummary,
)
from zentra_domain_analysis_run import (
    AnalysisRunThread,
    ThreadMessage,
    ThreadMessageKind,
    ThreadStatus,
)

from .database import Database, set_organization_context
from .draft_finding import (
    PostgresDraftFindingRepository,
    PostgresEvidenceCitationRepository,
)
from .execution_job import PostgresExecutionJobRepository
from .analysis_run import (
    PostgresAgentExecutionRepository,
    PostgresAuditOutboxRepository,
    PostgresHumanApprovalRepository,
    PostgresAnalysisRunRepository,
)
from .schema import analysis_runs, chat_sessions, messages
from .work_feed import PostgresWorkFeedRepository
from .workspace import PostgresGroupRepository


def _thread_from_row(row: Any) -> AnalysisRunThread:
    value = row._mapping
    return AnalysisRunThread(
        thread_id=value["chat_session_id"],
        organization_id=value["organization_id"],
        project_id=value["group_id"],
        initiating_message_id=value["initiating_message_id"],
        title=value["title"],
        status=ThreadStatus(value["status"]),
        archived_from_status=(
            ThreadStatus(value["archived_from_status"])
            if value["archived_from_status"]
            else None
        ),
        created_at=value["created_at"],
        updated_at=value["updated_at"],
        latest_activity_at=value["latest_activity_at"],
        archived_at=value["archived_at"],
        created_by=value["created_by"],
        source_scope_id=value["source_scope_id"],
    )


def _message_from_row(row: Any) -> ThreadMessage:
    value = row._mapping
    return ThreadMessage(
        message_id=value["message_id"],
        thread_id=value["chat_session_id"],
        organization_id=value["organization_id"],
        author_id=value["author_id"],
        kind=ThreadMessageKind(value["kind"]),
        content=value["content"],
        created_at=value["created_at"],
    )


class PostgresThreadRepository:
    def __init__(self, connection: AsyncConnection) -> None:
        self._connection = connection

    async def add_thread(self, thread: AnalysisRunThread) -> None:
        await self._connection.execute(
            insert(chat_sessions).values(
                chat_session_id=thread.thread_id,
                organization_id=thread.organization_id,
                group_id=thread.project_id,
                initiating_message_id=thread.initiating_message_id,
                title=thread.title,
                status=thread.status.value,
                archived_from_status=None,
                created_at=thread.created_at,
                updated_at=thread.updated_at,
                latest_activity_at=thread.latest_activity_at,
                archived_at=thread.archived_at,
                created_by=thread.created_by,
                source_scope_id=thread.source_scope_id,
            )
        )

    async def get_thread(
        self, thread_id: UUID, *, for_update: bool = False
    ) -> AnalysisRunThread | None:
        statement = select(chat_sessions).where(
            chat_sessions.c.chat_session_id == thread_id
        )
        if for_update:
            statement = statement.with_for_update()
        row = (await self._connection.execute(statement)).first()
        return _thread_from_row(row) if row else None

    async def save_thread(self, thread: AnalysisRunThread) -> None:
        await self._connection.execute(
            update(chat_sessions)
            .where(chat_sessions.c.chat_session_id == thread.thread_id)
            .values(
                title=thread.title,
                status=thread.status.value,
                archived_from_status=(
                    thread.archived_from_status.value
                    if thread.archived_from_status
                    else None
                ),
                updated_at=thread.updated_at,
                latest_activity_at=thread.latest_activity_at,
                archived_at=thread.archived_at,
            )
        )

    async def delete_thread(self, thread_id: UUID) -> None:
        await self._connection.execute(
            delete(chat_sessions).where(
                chat_sessions.c.chat_session_id == thread_id
            )
        )

    async def add_message(self, message: ThreadMessage) -> None:
        sequence = (
            await self._connection.execute(
                update(chat_sessions)
                .where(chat_sessions.c.chat_session_id == message.thread_id)
                .values(
                    next_message_sequence=(
                        chat_sessions.c.next_message_sequence + 1
                    )
                )
                .returning(chat_sessions.c.next_message_sequence - 1)
            )
        ).scalar_one()
        await self._connection.execute(
            insert(messages).values(
                message_id=message.message_id,
                chat_session_id=message.thread_id,
                organization_id=message.organization_id,
                author_id=message.author_id,
                kind=message.kind.value,
                content=message.content,
                created_at=message.created_at,
                sequence=sequence,
            )
        )

    async def messages_for_thread(self, thread_id: UUID) -> tuple[ThreadMessage, ...]:
        statement = (
            select(messages)
            .where(messages.c.chat_session_id == thread_id)
            .order_by(
                messages.c.created_at,
                messages.c.sequence,
            )
        )
        rows = (await self._connection.execute(statement)).all()
        return tuple(_message_from_row(row) for row in rows)

    async def list_threads(
        self,
        *,
        project_id: UUID,
        viewer_id: UUID,
        include_archived: bool,
        limit: int,
        after: ThreadCursor | None,
    ) -> ThreadSlice:
        latest_analysis_run = (
            select(analysis_runs.c.analysis_run_id)
            .where(analysis_runs.c.chat_session_id == chat_sessions.c.chat_session_id)
            .order_by(analysis_runs.c.chat_sequence.desc())
            .limit(1)
            .scalar_subquery()
        )
        statement = select(
            chat_sessions,
            latest_analysis_run.label("analysis_run_id"),
        ).where(
            chat_sessions.c.group_id == project_id,
            # A private Chat Session is invisible to every Group member
            # except its creator, in listings too -- filtered here, not
            # post-fetch, so pagination stays correct (a post-fetch filter
            # would produce short pages or gaps once private sessions exist).
            or_(
                chat_sessions.c.visibility != "private",
                chat_sessions.c.created_by == viewer_id,
            ),
        )
        if not include_archived:
            statement = statement.where(
                chat_sessions.c.status != ThreadStatus.ARCHIVED.value
            )
        if after is not None:
            statement = statement.where(
                tuple_(
                    chat_sessions.c.latest_activity_at,
                    chat_sessions.c.chat_session_id,
                )
                < tuple_(after.activity_at, after.thread_id)
            )
        statement = statement.order_by(
            chat_sessions.c.latest_activity_at.desc(),
            chat_sessions.c.chat_session_id.desc(),
        ).limit(limit + 1)
        rows = (await self._connection.execute(statement)).all()
        summaries = tuple(
            ThreadSummary(
                thread_id=row.chat_session_id,
                project_id=row.group_id,
                title=row.title,
                status=ThreadStatus(row.status),
                latest_activity_at=row.latest_activity_at,
                analysis_run_id=row.analysis_run_id,
            )
            for row in rows
        )
        if len(summaries) <= limit:
            return ThreadSlice(summaries, None)
        visible = summaries[:limit]
        last = visible[-1]
        return ThreadSlice(
            visible,
            ThreadCursor(last.latest_activity_at, last.thread_id),
        )

    async def analysis_run_id_for_thread(self, thread_id: UUID) -> UUID | None:
        statement = (
            select(analysis_runs.c.analysis_run_id)
            .where(analysis_runs.c.chat_session_id == thread_id)
            .order_by(analysis_runs.c.chat_sequence.desc())
            .limit(1)
        )
        return (await self._connection.execute(statement)).scalar_one_or_none()

    async def visibility_and_creator(
        self, thread_id: UUID
    ) -> tuple[str, UUID | None] | None:
        statement = select(
            chat_sessions.c.visibility, chat_sessions.c.created_by
        ).where(chat_sessions.c.chat_session_id == thread_id)
        row = (await self._connection.execute(statement)).one_or_none()
        return (row.visibility, row.created_by) if row else None

    async def source_scope_id(self, thread_id: UUID) -> UUID | None:
        statement = select(chat_sessions.c.source_scope_id).where(
            chat_sessions.c.chat_session_id == thread_id
        )
        return (await self._connection.execute(statement)).scalar_one_or_none()

    async def set_source_scope_id(
        self, thread_id: UUID, source_scope_id: UUID | None
    ) -> None:
        await self._connection.execute(
            update(chat_sessions)
            .where(chat_sessions.c.chat_session_id == thread_id)
            .values(source_scope_id=source_scope_id)
        )


class PostgresThreadUnitOfWork:
    def __init__(
        self, connection: AsyncConnection, *, trace_id: UUID, span_id: UUID
    ) -> None:
        self.threads = PostgresThreadRepository(connection)
        self.groups = PostgresGroupRepository(connection)
        self.analysis_runs = PostgresAnalysisRunRepository(connection)
        self.jobs = PostgresExecutionJobRepository(connection)
        self.outbox = PostgresAuditOutboxRepository(
            connection, trace_id=trace_id, span_id=span_id
        )
        self.work_feed = PostgresWorkFeedRepository(connection)
        self.approvals = PostgresHumanApprovalRepository(connection)
        self.agent_executions = PostgresAgentExecutionRepository(connection)
        self.draft_findings = PostgresDraftFindingRepository(connection)
        self.citations = PostgresEvidenceCitationRepository(connection)
        self.should_commit = False

    async def commit(self) -> None:
        self.should_commit = True


class PostgresThreadUnitOfWorkFactory:
    def __init__(self, database: Database) -> None:
        self._database = database

    @asynccontextmanager
    async def __call__(
        self,
        organization_id: UUID,
        trace_id: UUID,
        span_id: UUID,
    ) -> AsyncIterator[PostgresThreadUnitOfWork]:
        async with self._database.engine.connect() as connection:
            await connection.execution_options(isolation_level="REPEATABLE READ")
            transaction = await connection.begin()
            await set_organization_context(connection, organization_id)
            unit_of_work = PostgresThreadUnitOfWork(
                connection, trace_id=trace_id, span_id=span_id
            )
            try:
                yield unit_of_work
            except Exception:
                await transaction.rollback()
                raise
            else:
                if unit_of_work.should_commit:
                    await transaction.commit()
                else:
                    await transaction.rollback()
