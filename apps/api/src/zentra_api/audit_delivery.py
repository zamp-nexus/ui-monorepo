from __future__ import annotations

import asyncio
from collections.abc import Sequence
from contextlib import suppress
from datetime import UTC, datetime
from decimal import Decimal
from typing import Any
from uuid import UUID

from zentra_adapter_clickhouse import AuditEntry, AuditRepository
from zentra_adapter_postgres import (
    OutboxRecord,
    PostgresInvestigationUnitOfWorkFactory,
)
from zentra_application_investigation import (
    AuditDelivery,
    TimelineEntry,
)

SYSTEM_TRACE_ID = UUID(int=0)
SYSTEM_SPAN_ID = UUID(int=0)


class AuditDeliveryCoordinator:
    """Moves tenant-scoped outbox events into the immutable audit ledger."""

    def __init__(
        self,
        *,
        unit_of_work_factory: PostgresInvestigationUnitOfWorkFactory,
        audit: AuditRepository,
        retry_interval_seconds: float = 1,
    ) -> None:
        self._unit_of_work_factory = unit_of_work_factory
        self._audit = audit
        self._retry_interval_seconds = retry_interval_seconds
        self._active_tenants: set[UUID] = set()
        self._stop = asyncio.Event()
        self._task: asyncio.Task[None] | None = None

    async def flush(self, *, tenant_id: UUID, investigation_id: UUID) -> bool:
        self._active_tenants.add(tenant_id)
        async with self._unit_of_work_factory(
            tenant_id,
            SYSTEM_TRACE_ID,
            SYSTEM_SPAN_ID,
        ) as unit_of_work:
            pending = await unit_of_work.outbox.pending(
                investigation_id=investigation_id
            )

        delivered = True
        for record in pending:
            try:
                await self._audit.append(self._entry(record))
            except Exception:
                delivered = False
                async with self._unit_of_work_factory(
                    tenant_id,
                    SYSTEM_TRACE_ID,
                    SYSTEM_SPAN_ID,
                ) as unit_of_work:
                    await unit_of_work.outbox.mark_failed(
                        record.event_id,
                        "clickhouse_unavailable",
                    )
                    await unit_of_work.commit()
                continue
            async with self._unit_of_work_factory(
                tenant_id,
                SYSTEM_TRACE_ID,
                SYSTEM_SPAN_ID,
            ) as unit_of_work:
                await unit_of_work.outbox.mark_dispatched(
                    record.event_id,
                    datetime.now(UTC),
                )
                await unit_of_work.commit()
        return delivered

    async def list_timeline(
        self,
        *,
        tenant_id: UUID,
        investigation_id: UUID,
    ) -> Sequence[TimelineEntry]:
        self._active_tenants.add(tenant_id)
        try:
            delivered_rows = await self._audit.list_for_investigation(
                tenant_id=tenant_id,
                investigation_id=investigation_id,
            )
        except Exception:
            delivered_rows = []
        async with self._unit_of_work_factory(
            tenant_id,
            SYSTEM_TRACE_ID,
            SYSTEM_SPAN_ID,
        ) as unit_of_work:
            outbox_rows = await unit_of_work.outbox.all_for_investigation(
                investigation_id
            )

        entries: dict[UUID, TimelineEntry] = {}
        for row in delivered_rows:
            entry_id = UUID(str(row["entry_id"]))
            entries[entry_id] = TimelineEntry(
                entry_id=entry_id,
                event_type=str(row["event_type"]),
                status=str(row["status"]),
                created_at=row["created_at"],
                artifact_refs=tuple(row.get("artifact_refs", ())),
                delivery=AuditDelivery.COMPLETE,
            )
        for record in outbox_rows:
            if record.dispatched_at is not None:
                continue
            payload = record.payload
            entries.setdefault(
                record.event_id,
                TimelineEntry(
                    entry_id=record.event_id,
                    event_type=str(payload["event_type"]),
                    status=str(payload["status"]),
                    created_at=record.created_at,
                    artifact_refs=tuple(payload.get("artifact_refs", ())),
                    delivery=AuditDelivery.PENDING,
                ),
            )
        return tuple(
            sorted(
                entries.values(),
                key=lambda entry: (entry.created_at, entry.entry_id),
            )
        )

    def start(self) -> None:
        if self._task is None:
            self._task = asyncio.create_task(self._retry_loop())

    async def stop(self) -> None:
        self._stop.set()
        if self._task is not None:
            self._task.cancel()
            with suppress(asyncio.CancelledError):
                await self._task

    async def _retry_loop(self) -> None:
        while not self._stop.is_set():
            tenant_ids = set(self._active_tenants)
            with suppress(Exception):
                tenant_ids.update(
                    await self._unit_of_work_factory.bound_tenant_ids()
                )
            for tenant_id in tenant_ids:
                try:
                    async with self._unit_of_work_factory(
                        tenant_id,
                        SYSTEM_TRACE_ID,
                        SYSTEM_SPAN_ID,
                    ) as unit_of_work:
                        pending = await unit_of_work.outbox.pending()
                    investigation_ids = {
                        record.investigation_id for record in pending
                    }
                    for investigation_id in investigation_ids:
                        await self.flush(
                            tenant_id=tenant_id,
                            investigation_id=investigation_id,
                        )
                except Exception:
                    continue
            await asyncio.sleep(self._retry_interval_seconds)

    @staticmethod
    def _entry(record: OutboxRecord) -> AuditEntry:
        payload: dict[str, Any] = record.payload
        occurred_at = datetime.fromisoformat(str(payload["occurred_at"]))
        return AuditEntry(
            entry_id=record.event_id,
            trace_id=UUID(str(payload["trace_id"])),
            span_id=UUID(str(payload["span_id"])),
            tenant_id=record.tenant_id,
            investigation_id=record.investigation_id,
            event_type=str(payload["event_type"]),
            started_at=occurred_at,
            completed_at=occurred_at,
            latency_ms=0,
            input_tokens=0,
            output_tokens=0,
            total_cost_usd=Decimal("0"),
            input_hash=str(payload["input_hash"]),
            outcome_kind="validation"
            if payload["event_type"] == "investigation.validation_completed"
            else None,
            status=str(payload["status"]),
            artifact_refs=tuple(payload.get("artifact_refs", ())),
            redacted_metadata=payload.get("metadata", {}),
            created_at=occurred_at,
        )
