from __future__ import annotations

from collections.abc import AsyncIterator, Sequence
from contextlib import asynccontextmanager
from dataclasses import dataclass
from datetime import datetime
from decimal import Decimal
from hashlib import sha256
from typing import Any
from uuid import UUID

from sqlalchemy import insert, select, update
from sqlalchemy.ext.asyncio import AsyncConnection
from zentra_application_investigation import InvestigationUnitOfWork
from zentra_domain_agent_execution import OUTCOME_ADAPTER, AgentExecutionRecord
from zentra_domain_investigation import (
    ApprovalReason,
    CompletionOutcome,
    DomainEvent,
    EvidenceReference,
    FailureOutcome,
    Finding,
    HumanApproval,
    HumanApprovalStatus,
    Investigation,
    InvestigationStatus,
    MetricComparison,
    RejectionReason,
)

from .database import Database, set_tenant_context
from .schema import (
    agent_executions,
    audit_outbox,
    human_approvals,
    investigations,
    tenant_identity_bindings,
    tenants,
)


class ConcurrentInvestigationUpdateError(RuntimeError):
    pass


def _finding_to_json(finding: Finding | None) -> dict[str, Any] | None:
    if finding is None:
        return None
    return {
        "headline": finding.headline,
        "summary": finding.summary,
        "metrics": [
            {
                "metric": metric.metric,
                "previous_value": metric.previous_value,
                "current_value": metric.current_value,
                "unit": metric.unit,
            }
            for metric in finding.metrics
        ],
        "evidence_refs": [ref.value for ref in finding.evidence_refs],
    }


def _finding_from_json(value: dict[str, Any] | None) -> Finding | None:
    if value is None:
        return None
    return Finding(
        headline=value["headline"],
        summary=value["summary"],
        metrics=tuple(
            MetricComparison(
                metric=metric["metric"],
                previous_value=metric["previous_value"],
                current_value=metric["current_value"],
                unit=metric["unit"],
            )
            for metric in value["metrics"]
        ),
        evidence_refs=tuple(
            EvidenceReference(reference) for reference in value["evidence_refs"]
        ),
    )


def _state_to_json(investigation: Investigation) -> dict[str, Any]:
    outcome = investigation.outcome
    return {
        "finding": _finding_to_json(investigation.finding),
        "outcome": outcome.model_dump(mode="json") if outcome else None,
        "completion": (
            {"human_approved": investigation.completion.human_approved}
            if investigation.completion
            else None
        ),
        "failure": (
            {
                "code": investigation.failure.code,
                "message": investigation.failure.message,
            }
            if investigation.failure
            else None
        ),
    }


def _investigation_from_row(row: Any) -> Investigation:
    state = row.state or {}
    finding = _finding_from_json(state.get("finding"))
    outcome_value = state.get("outcome")
    outcome = OUTCOME_ADAPTER.validate_python(outcome_value) if outcome_value else None
    completion_value = state.get("completion")
    completion = (
        CompletionOutcome(
            finding=finding,
            human_approved=completion_value["human_approved"],
        )
        if completion_value and finding
        else None
    )
    failure_value = state.get("failure")
    failure = (
        FailureOutcome(
            code=failure_value["code"],
            message=failure_value["message"],
        )
        if failure_value
        else None
    )
    return Investigation(
        investigation_id=row.investigation_id,
        tenant_id=row.tenant_id,
        question=row.question,
        scenario_key=row.scenario_key or "",
        status=InvestigationStatus(row.status),
        version=row.version,
        evaluation_attempts=row.evaluation_attempts,
        created_at=row.created_at,
        updated_at=row.updated_at,
        finished_at=row.finished_at,
        finding=finding,
        outcome=outcome,
        completion=completion,
        failure=failure,
        events=[],
    )


class PostgresInvestigationRepository:
    def __init__(self, connection: AsyncConnection) -> None:
        self._connection = connection

    async def add(self, investigation: Investigation) -> None:
        await self._connection.execute(
            insert(investigations).values(
                investigation_id=investigation.investigation_id,
                tenant_id=investigation.tenant_id,
                question=investigation.question,
                status=investigation.status.value,
                state=_state_to_json(investigation),
                scenario_key=investigation.scenario_key,
                version=investigation.version,
                evaluation_attempts=investigation.evaluation_attempts,
                created_at=investigation.created_at,
                updated_at=investigation.updated_at,
                finished_at=investigation.finished_at,
            )
        )

    async def get(
        self,
        investigation_id: UUID,
        *,
        for_update: bool = False,
    ) -> Investigation | None:
        query = select(investigations).where(
            investigations.c.investigation_id == investigation_id
        )
        if for_update:
            query = query.with_for_update()
        row = (await self._connection.execute(query)).one_or_none()
        return _investigation_from_row(row) if row else None

    async def save(
        self,
        investigation: Investigation,
        *,
        expected_version: int,
    ) -> None:
        result = await self._connection.execute(
            update(investigations)
            .where(
                investigations.c.investigation_id == investigation.investigation_id,
                investigations.c.version == expected_version,
            )
            .values(
                status=investigation.status.value,
                state=_state_to_json(investigation),
                version=investigation.version,
                evaluation_attempts=investigation.evaluation_attempts,
                updated_at=investigation.updated_at,
                finished_at=investigation.finished_at,
            )
        )
        if result.rowcount != 1:
            raise ConcurrentInvestigationUpdateError(
                "Investigation was modified by another request"
            )


class PostgresHumanApprovalRepository:
    def __init__(self, connection: AsyncConnection) -> None:
        self._connection = connection

    async def add(self, approval: HumanApproval) -> None:
        await self._connection.execute(
            insert(human_approvals).values(
                approval_id=approval.approval_id,
                investigation_id=approval.investigation_id,
                tenant_id=approval.tenant_id,
                reason=approval.reason.value,
                status=approval.status.value,
                requested_at=approval.requested_at,
            )
        )

    async def get_for_investigation(
        self,
        investigation_id: UUID,
        *,
        approval_id: UUID | None = None,
        for_update: bool = False,
    ) -> HumanApproval | None:
        query = select(human_approvals).where(
            human_approvals.c.investigation_id == investigation_id
        )
        if approval_id is not None:
            query = query.where(human_approvals.c.approval_id == approval_id)
        query = query.order_by(human_approvals.c.requested_at.desc()).limit(1)
        if for_update:
            query = query.with_for_update()
        row = (await self._connection.execute(query)).one_or_none()
        if row is None:
            return None
        return HumanApproval(
            approval_id=row.approval_id,
            investigation_id=row.investigation_id,
            tenant_id=row.tenant_id,
            reason=ApprovalReason(row.reason),
            status=HumanApprovalStatus(row.status),
            requested_at=row.requested_at,
            decided_at=row.decided_at,
            decided_by=row.decided_by,
            decision_reason=(
                RejectionReason(row.decision_reason)
                if row.decision_reason is not None
                else None
            ),
        )

    async def save(self, approval: HumanApproval) -> None:
        await self._connection.execute(
            update(human_approvals)
            .where(human_approvals.c.approval_id == approval.approval_id)
            .values(
                status=approval.status.value,
                decided_at=approval.decided_at,
                decided_by=approval.decided_by,
                decision_reason=(
                    approval.decision_reason.value
                    if approval.decision_reason is not None
                    else None
                ),
            )
        )


@dataclass(frozen=True, slots=True)
class OutboxRecord:
    event_id: UUID
    tenant_id: UUID
    investigation_id: UUID
    payload: dict[str, Any]
    attempts: int
    created_at: datetime
    dispatched_at: datetime | None


class PostgresAuditOutboxRepository:
    def __init__(
        self,
        connection: AsyncConnection,
        *,
        trace_id: UUID,
        span_id: UUID,
    ) -> None:
        self._connection = connection
        self._trace_id = trace_id
        self._span_id = span_id

    async def enqueue(self, events: Sequence[DomainEvent]) -> None:
        if not events:
            return
        rows = []
        for event in events:
            digest = sha256(f"{event.event_type}:{event.event_id}".encode()).hexdigest()
            rows.append(
                {
                    "event_id": event.event_id,
                    "tenant_id": event.tenant_id,
                    "investigation_id": event.investigation_id,
                    "payload": {
                        "trace_id": str(self._trace_id),
                        "span_id": str(self._span_id),
                        "event_type": event.event_type,
                        "status": event.status.value,
                        "occurred_at": event.occurred_at.isoformat(),
                        "input_hash": f"sha256:{digest}",
                        "artifact_refs": [
                            reference.value for reference in event.artifact_refs
                        ],
                        "metadata": event.metadata,
                    },
                    "created_at": event.occurred_at,
                }
            )
        await self._connection.execute(insert(audit_outbox), rows)

    async def pending(
        self,
        *,
        investigation_id: UUID | None = None,
        limit: int = 100,
    ) -> tuple[OutboxRecord, ...]:
        query = select(audit_outbox).where(audit_outbox.c.dispatched_at.is_(None))
        if investigation_id is not None:
            query = query.where(audit_outbox.c.investigation_id == investigation_id)
        query = query.order_by(
            audit_outbox.c.created_at,
            audit_outbox.c.event_id,
        ).limit(limit)
        rows = (await self._connection.execute(query)).all()
        return tuple(
            OutboxRecord(
                event_id=row.event_id,
                tenant_id=row.tenant_id,
                investigation_id=row.investigation_id,
                payload=row.payload,
                attempts=row.attempts,
                created_at=row.created_at,
                dispatched_at=row.dispatched_at,
            )
            for row in rows
        )

    async def all_for_investigation(
        self,
        investigation_id: UUID,
    ) -> tuple[OutboxRecord, ...]:
        rows = (
            await self._connection.execute(
                select(audit_outbox)
                .where(audit_outbox.c.investigation_id == investigation_id)
                .order_by(audit_outbox.c.created_at, audit_outbox.c.event_id)
            )
        ).all()
        return tuple(
            OutboxRecord(
                event_id=row.event_id,
                tenant_id=row.tenant_id,
                investigation_id=row.investigation_id,
                payload=row.payload,
                attempts=row.attempts,
                created_at=row.created_at,
                dispatched_at=row.dispatched_at,
            )
            for row in rows
        )

    async def mark_dispatched(self, event_id: UUID, now: datetime) -> None:
        await self._connection.execute(
            update(audit_outbox)
            .where(audit_outbox.c.event_id == event_id)
            .values(dispatched_at=now, last_error_code=None)
        )

    async def mark_failed(self, event_id: UUID, error_code: str) -> None:
        await self._connection.execute(
            update(audit_outbox)
            .where(audit_outbox.c.event_id == event_id)
            .values(
                attempts=audit_outbox.c.attempts + 1,
                last_error_code=error_code,
            )
        )


class PostgresAgentExecutionRepository:
    """Holds the full agent output, including result rows.

    This is the tenant-scoped, RLS-protected store an `artifact://execution/{id}`
    pointer resolves to. Raw values live here and never in the audit ledger.
    """

    def __init__(self, connection: AsyncConnection) -> None:
        self._connection = connection

    async def add(self, execution: AgentExecutionRecord) -> None:
        outcome = execution.outcome
        await self._connection.execute(
            insert(agent_executions).values(
                execution_id=execution.execution_id,
                investigation_id=execution.investigation_id,
                tenant_id=execution.tenant_id,
                agent_id=execution.agent_id,
                step=execution.step,
                input=execution.input,
                output=execution.output,
                outcome_kind=outcome.kind if outcome else None,
                confidence=(
                    Decimal(str(execution.confidence))
                    if execution.confidence is not None
                    else None
                ),
                outcome=outcome.model_dump(mode="json") if outcome else None,
                status=execution.status.value,
                latency_ms=execution.latency_ms,
                cost_usd=Decimal(str(execution.usage.cost_usd)),
                model=execution.usage.model,
                started_at=execution.started_at,
                completed_at=execution.completed_at,
            )
        )


class PostgresTenantPolicyRepository:
    def __init__(self, connection: AsyncConnection) -> None:
        self._connection = connection

    async def confidence_threshold(self, tenant_id: UUID) -> float:
        value = (
            await self._connection.execute(
                select(tenants.c.confidence_threshold).where(
                    tenants.c.tenant_id == tenant_id
                )
            )
        ).scalar_one()
        return float(value)

    async def model_tier(self, tenant_id: UUID) -> str:
        return str(
            (
                await self._connection.execute(
                    select(tenants.c.model_tier).where(
                        tenants.c.tenant_id == tenant_id
                    )
                )
            ).scalar_one()
        )


class PostgresInvestigationUnitOfWork(InvestigationUnitOfWork):
    def __init__(
        self,
        connection: AsyncConnection,
        *,
        trace_id: UUID,
        span_id: UUID,
    ) -> None:
        self.investigations = PostgresInvestigationRepository(connection)
        self.approvals = PostgresHumanApprovalRepository(connection)
        self.agent_executions = PostgresAgentExecutionRepository(connection)
        self.policies = PostgresTenantPolicyRepository(connection)
        self.outbox = PostgresAuditOutboxRepository(
            connection,
            trace_id=trace_id,
            span_id=span_id,
        )
        self.should_commit = False

    async def commit(self) -> None:
        self.should_commit = True


class PostgresInvestigationUnitOfWorkFactory:
    def __init__(self, database: Database) -> None:
        self._database = database

    async def bound_tenant_ids(self) -> tuple[UUID, ...]:
        async with self._database.engine.connect() as connection:
            rows = (
                await connection.execute(
                    select(tenant_identity_bindings.c.tenant_id).distinct()
                )
            ).scalars()
            return tuple(rows)

    @asynccontextmanager
    async def __call__(
        self,
        tenant_id: UUID,
        trace_id: UUID,
        span_id: UUID,
    ) -> AsyncIterator[PostgresInvestigationUnitOfWork]:
        async with self._database.engine.connect() as connection:
            transaction = await connection.begin()
            await set_tenant_context(connection, tenant_id)
            unit_of_work = PostgresInvestigationUnitOfWork(
                connection,
                trace_id=trace_id,
                span_id=span_id,
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
