from __future__ import annotations

from contextlib import asynccontextmanager
from datetime import UTC, datetime
from uuid import uuid4

import pytest
from zentra_adapter_postgres import OutboxRecord

from zentra_api.audit_delivery import AuditDeliveryCoordinator


class Outbox:
    def __init__(self, record: OutboxRecord) -> None:
        self.record = record
        self.dispatched = False
        self.attempts = 0

    async def pending(self, **kwargs: object) -> tuple[OutboxRecord, ...]:
        return () if self.dispatched else (self.record,)

    async def mark_failed(self, *args: object) -> None:
        self.attempts += 1

    async def mark_dispatched(self, *args: object) -> None:
        self.dispatched = True


class UnitOfWork:
    def __init__(self, outbox: Outbox) -> None:
        self.outbox = outbox

    async def commit(self) -> None:
        return None


class Factory:
    def __init__(self, unit_of_work: UnitOfWork) -> None:
        self.unit_of_work = unit_of_work

    @asynccontextmanager
    async def __call__(self, *args: object):
        yield self.unit_of_work


class FlakyAudit:
    def __init__(self) -> None:
        self.fail = True
        self.entries = []

    async def append(self, entry: object) -> None:
        if self.fail:
            raise RuntimeError("unavailable")
        self.entries.append(entry)


@pytest.mark.asyncio
async def test_outbox_delivery_retries_with_the_same_event_id() -> None:
    now = datetime.now(UTC)
    record = OutboxRecord(
        event_id=uuid4(),
        tenant_id=uuid4(),
        investigation_id=uuid4(),
        payload={
            "trace_id": str(uuid4()),
            "span_id": str(uuid4()),
            "event_type": "investigation.created",
            "status": "pending",
            "occurred_at": now.isoformat(),
            "input_hash": "sha256:fixture",
            "artifact_refs": [],
            "metadata": {"scenario_key": "eu_refund_spike"},
        },
        attempts=0,
        created_at=now,
        dispatched_at=None,
    )
    outbox = Outbox(record)
    audit = FlakyAudit()
    coordinator = AuditDeliveryCoordinator(
        unit_of_work_factory=Factory(UnitOfWork(outbox)),  # type: ignore[arg-type]
        audit=audit,  # type: ignore[arg-type]
    )

    assert (
        await coordinator.flush(
            tenant_id=record.tenant_id,
            investigation_id=record.investigation_id,
        )
        is False
    )
    assert outbox.attempts == 1

    audit.fail = False
    assert (
        await coordinator.flush(
            tenant_id=record.tenant_id,
            investigation_id=record.investigation_id,
        )
        is True
    )
    assert outbox.dispatched is True
    assert audit.entries[0].entry_id == record.event_id
