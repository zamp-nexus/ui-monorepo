from __future__ import annotations

from datetime import datetime
from uuid import UUID, uuid4

from pydantic import TypeAdapter
from sqlalchemy import func, insert, select, update
from sqlalchemy.ext.asyncio import AsyncConnection
from zentra_domain_investigation import (
    ThreadEvent,
    WorkFeedEventKind,
    WorkFeedPayload,
)

from .schema import activity_events, analysis_runs, chat_sessions

_PAYLOAD = TypeAdapter(WorkFeedPayload)


class PostgresWorkFeedRepository:
    def __init__(self, connection: AsyncConnection) -> None:
        self._connection = connection

    async def append(
        self,
        *,
        organization_id: UUID,
        thread_id: UUID,
        kind: WorkFeedEventKind,
        payload: WorkFeedPayload,
        occurred_at: datetime,
        event_id: UUID | None = None,
    ) -> ThreadEvent:
        if event_id is not None:
            existing = (
                await self._connection.execute(
                    select(activity_events).where(
                        activity_events.c.event_id == event_id
                    )
                )
            ).one_or_none()
            if existing is not None:
                return _event(existing)
        sequence = (
            await self._connection.execute(
                update(chat_sessions)
                .where(chat_sessions.c.chat_session_id == thread_id)
                .values(
                    next_event_sequence=(
                        chat_sessions.c.next_event_sequence + 1
                    )
                )
                .returning(chat_sessions.c.next_event_sequence - 1)
            )
        ).scalar_one()
        event = ThreadEvent(
            event_id=event_id or uuid4(),
            organization_id=organization_id,
            thread_id=thread_id,
            sequence=sequence,
            kind=kind,
            occurred_at=occurred_at,
            payload=payload,
        )
        await self._connection.execute(
            insert(activity_events).values(
                event_id=event.event_id,
                organization_id=event.organization_id,
                chat_session_id=event.thread_id,
                sequence=event.sequence,
                kind=event.kind.value,
                payload=event.payload.model_dump(mode="json"),
                occurred_at=event.occurred_at,
            )
        )
        # Delivery never depends on this notification. It is only a wake-up
        # hint; reconnecting consumers always resume from persisted sequence.
        await self._connection.execute(
            select(func.pg_notify("zentra_thread_events", str(thread_id)))
        )
        return event

    async def append_for_investigation(
        self,
        *,
        organization_id: UUID,
        investigation_id: UUID,
        kind: WorkFeedEventKind,
        payload: WorkFeedPayload,
        occurred_at: datetime,
        event_id: UUID | None = None,
    ) -> ThreadEvent | None:
        thread_id = (
            await self._connection.execute(
                select(analysis_runs.c.chat_session_id).where(
                    analysis_runs.c.analysis_run_id == investigation_id
                )
            )
        ).scalar_one_or_none()
        if thread_id is None:
            return None
        return await self.append(
            organization_id=organization_id,
            thread_id=thread_id,
            kind=kind,
            payload=payload,
            occurred_at=occurred_at,
            event_id=event_id,
        )

    async def events_after(
        self, thread_id: UUID, *, after: int, limit: int = 500
    ) -> tuple[ThreadEvent, ...]:
        rows = (
            await self._connection.execute(
                select(activity_events)
                .where(
                    activity_events.c.chat_session_id == thread_id,
                    activity_events.c.sequence > after,
                )
                .order_by(activity_events.c.sequence)
                .limit(limit)
            )
        ).all()
        return tuple(_event(row) for row in rows)

    async def latest_sequence(self, thread_id: UUID) -> int:
        next_value = (
            await self._connection.execute(
                select(chat_sessions.c.next_event_sequence).where(
                    chat_sessions.c.chat_session_id == thread_id
                )
            )
        ).scalar_one_or_none()
        return max(0, (next_value or 1) - 1)


def _event(row: object) -> ThreadEvent:
    return ThreadEvent(
        event_id=row.event_id,
        organization_id=row.organization_id,
        thread_id=row.chat_session_id,
        sequence=row.sequence,
        kind=WorkFeedEventKind(row.kind),
        payload=_PAYLOAD.validate_python(row.payload),
        occurred_at=row.occurred_at,
    )
