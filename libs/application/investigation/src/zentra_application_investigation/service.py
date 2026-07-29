from __future__ import annotations

from collections.abc import Callable, Sequence
from contextlib import AbstractAsyncContextManager
from dataclasses import dataclass
from datetime import datetime
from enum import StrEnum
from typing import Protocol
from uuid import UUID

from zentra_domain_investigation import (
    ApprovalDecision,
    DomainEvent,
    EvaluationDirective,
    Finding,
    HumanApproval,
    HumanApprovalStatus,
    Investigation,
    InvestigationStatus,
    InvestigationTransitionError,
    InvestigationValidation,
    RejectionReason,
)

SCENARIO_KEY = "eu_refund_spike"
CANONICAL_QUESTION = "Why did EU refunds increase from June to July 2026?"


class Role(StrEnum):
    OWNER = "owner"
    ADMIN = "admin"
    MEMBER = "member"
    VIEWER = "viewer"


class AuditDelivery(StrEnum):
    COMPLETE = "complete"
    PENDING = "pending"


class UnsupportedScenarioError(ValueError):
    pass


class PermissionDeniedError(PermissionError):
    pass


class InvestigationNotFoundError(LookupError):
    pass


class ConflictError(RuntimeError):
    pass


class ScenarioUnavailableError(RuntimeError):
    pass


@dataclass(frozen=True, slots=True)
class AuthenticatedActor:
    user_id: UUID
    tenant_id: UUID
    role: Role
    trace_id: UUID
    span_id: UUID


@dataclass(frozen=True, slots=True)
class ScenarioResult:
    finding: Finding
    validation: InvestigationValidation


@dataclass(frozen=True, slots=True)
class TimelineEntry:
    entry_id: UUID
    event_type: str
    status: str
    created_at: datetime
    artifact_refs: tuple[str, ...] = ()
    delivery: AuditDelivery = AuditDelivery.COMPLETE

    @classmethod
    def from_domain_event(
        cls,
        event: DomainEvent,
        *,
        delivery: AuditDelivery,
    ) -> TimelineEntry:
        return cls(
            entry_id=event.event_id,
            event_type=event.event_type,
            status=event.status.value,
            created_at=event.occurred_at,
            artifact_refs=tuple(ref.value for ref in event.artifact_refs),
            delivery=delivery,
        )


@dataclass(frozen=True, slots=True)
class AuditReplay:
    timeline: tuple[TimelineEntry, ...]
    delivery: AuditDelivery


@dataclass(frozen=True, slots=True)
class PendingApproval:
    approval_id: UUID
    reason: str
    requested_at: datetime
    can_decide: bool


@dataclass(frozen=True, slots=True)
class InvestigationDetail:
    investigation_id: UUID
    question: str
    scenario_key: str
    status: InvestigationStatus
    version: int
    evaluation_attempts: int
    created_at: datetime
    updated_at: datetime
    finished_at: datetime | None
    finding: Finding | None
    validation: InvestigationValidation | None
    pending_approval: PendingApproval | None
    timeline: tuple[TimelineEntry, ...]
    audit_delivery: AuditDelivery


class GovernedScenario(Protocol):
    async def run(self) -> ScenarioResult: ...


class InvestigationRepository(Protocol):
    async def add(self, investigation: Investigation) -> None: ...

    async def get(
        self,
        investigation_id: UUID,
        *,
        for_update: bool = False,
    ) -> Investigation | None: ...

    async def save(
        self,
        investigation: Investigation,
        *,
        expected_version: int,
    ) -> None: ...


class HumanApprovalRepository(Protocol):
    async def add(self, approval: HumanApproval) -> None: ...

    async def get_for_investigation(
        self,
        investigation_id: UUID,
        *,
        approval_id: UUID | None = None,
        for_update: bool = False,
    ) -> HumanApproval | None: ...

    async def save(self, approval: HumanApproval) -> None: ...


class AgentExecutionRepository(Protocol):
    async def add(self, execution: object) -> None: ...


class AuditOutboxRepository(Protocol):
    async def enqueue(self, events: Sequence[DomainEvent]) -> None: ...


class InvestigationUnitOfWork(Protocol):
    investigations: InvestigationRepository
    approvals: HumanApprovalRepository
    agent_executions: AgentExecutionRepository
    outbox: AuditOutboxRepository

    async def commit(self) -> None: ...


class InvestigationUnitOfWorkFactory(Protocol):
    def __call__(
        self,
        tenant_id: UUID,
        trace_id: UUID,
        span_id: UUID,
    ) -> AbstractAsyncContextManager[InvestigationUnitOfWork]: ...


class AuditWriter(Protocol):
    async def flush(self, *, tenant_id: UUID, investigation_id: UUID) -> bool: ...


class AuditReader(Protocol):
    async def list_timeline(
        self,
        *,
        tenant_id: UUID,
        investigation_id: UUID,
    ) -> Sequence[TimelineEntry]: ...


class InvestigationService:
    def __init__(
        self,
        *,
        unit_of_work_factory: InvestigationUnitOfWorkFactory,
        scenario: GovernedScenario,
        audit_writer: AuditWriter,
        audit_reader: AuditReader,
        now: Callable[[], datetime],
        new_id: Callable[[], UUID],
    ) -> None:
        self._unit_of_work_factory = unit_of_work_factory
        self._scenario = scenario
        self._audit_writer = audit_writer
        self._audit_reader = audit_reader
        self._now = now
        self._new_id = new_id

    async def start(
        self,
        actor: AuthenticatedActor,
        *,
        scenario_key: str,
    ) -> InvestigationDetail:
        self._require_create_role(actor)
        if scenario_key != SCENARIO_KEY:
            raise UnsupportedScenarioError(
                f"Unsupported investigation scenario: {scenario_key}"
            )
        try:
            result = await self._scenario.run()
        except Exception as error:
            raise ScenarioUnavailableError(
                "The governed metric scenario is unavailable"
            ) from error

        now = self._now()
        investigation = Investigation.create(
            investigation_id=self._new_id(),
            tenant_id=actor.tenant_id,
            question=CANONICAL_QUESTION,
            scenario_key=scenario_key,
            now=now,
        )
        investigation.start(now)
        investigation.begin_evaluation(now)
        approval_reason = investigation.record_evaluation(
            directive=EvaluationDirective.REVIEW,
            validation=result.validation,
            finding=result.finding,
            now=now,
        )
        assert approval_reason is not None
        approval = HumanApproval(
            approval_id=self._new_id(),
            investigation_id=investigation.investigation_id,
            tenant_id=actor.tenant_id,
            reason=approval_reason,
            status=HumanApprovalStatus.PENDING,
            requested_at=now,
        )

        async with self._unit_of_work_factory(
            actor.tenant_id,
            actor.trace_id,
            actor.span_id,
        ) as unit_of_work:
            await unit_of_work.investigations.add(investigation)
            await unit_of_work.approvals.add(approval)
            await unit_of_work.outbox.enqueue(investigation.events)
            await unit_of_work.commit()

        delivered = await self._audit_writer.flush(
            tenant_id=actor.tenant_id,
            investigation_id=investigation.investigation_id,
        )
        return await self._detail(
            actor,
            investigation,
            approval,
            fallback_events=investigation.events,
            delivered=delivered,
        )

    async def get(
        self,
        actor: AuthenticatedActor,
        investigation_id: UUID,
    ) -> InvestigationDetail:
        async with self._unit_of_work_factory(
            actor.tenant_id,
            actor.trace_id,
            actor.span_id,
        ) as unit_of_work:
            investigation = await unit_of_work.investigations.get(investigation_id)
            if investigation is None:
                raise InvestigationNotFoundError("Investigation was not found")
            approval = await unit_of_work.approvals.get_for_investigation(
                investigation_id
            )
        return await self._detail(actor, investigation, approval)

    async def decide(
        self,
        actor: AuthenticatedActor,
        *,
        investigation_id: UUID,
        approval_id: UUID,
        decision: ApprovalDecision,
        rejection_reason: RejectionReason | None,
    ) -> InvestigationDetail:
        self._require_decision_role(actor)
        changed = False
        new_events: Sequence[DomainEvent] = ()
        async with self._unit_of_work_factory(
            actor.tenant_id,
            actor.trace_id,
            actor.span_id,
        ) as unit_of_work:
            investigation = await unit_of_work.investigations.get(
                investigation_id,
                for_update=True,
            )
            approval = await unit_of_work.approvals.get_for_investigation(
                investigation_id,
                approval_id=approval_id,
                for_update=True,
            )
            if investigation is None or approval is None:
                raise InvestigationNotFoundError("Investigation was not found")

            try:
                changed = approval.decide(
                    decision=decision,
                    rejection_reason=rejection_reason,
                    user_id=actor.user_id,
                    now=self._now(),
                )
                if changed:
                    expected_version = investigation.version
                    event_cursor = len(investigation.events)
                    investigation.decide(
                        decision=decision,
                        rejection_reason=rejection_reason,
                        now=self._now(),
                    )
                    new_events = investigation.events[event_cursor:]
                    await unit_of_work.investigations.save(
                        investigation,
                        expected_version=expected_version,
                    )
                    await unit_of_work.approvals.save(approval)
                    await unit_of_work.outbox.enqueue(new_events)
                    await unit_of_work.commit()
            except InvestigationTransitionError as error:
                raise ConflictError(str(error)) from error

        delivered = True
        if changed:
            delivered = await self._audit_writer.flush(
                tenant_id=actor.tenant_id,
                investigation_id=investigation_id,
            )
        return await self._detail(
            actor,
            investigation,
            approval,
            fallback_events=new_events,
            delivered=delivered,
        )

    async def _detail(
        self,
        actor: AuthenticatedActor,
        investigation: Investigation,
        approval: HumanApproval | None,
        *,
        fallback_events: Sequence[DomainEvent] = (),
        delivered: bool = True,
    ) -> InvestigationDetail:
        timeline = tuple(
            await self._audit_reader.list_timeline(
                tenant_id=actor.tenant_id,
                investigation_id=investigation.investigation_id,
            )
        )
        delivery = (
            AuditDelivery.PENDING
            if not delivered
            or any(entry.delivery is AuditDelivery.PENDING for entry in timeline)
            else AuditDelivery.COMPLETE
        )
        by_id = {entry.entry_id: entry for entry in timeline}
        for event in fallback_events:
            by_id.setdefault(
                event.event_id,
                TimelineEntry.from_domain_event(event, delivery=delivery),
            )
        merged_timeline = tuple(
            sorted(by_id.values(), key=lambda entry: (entry.created_at, entry.entry_id))
        )
        pending_approval = None
        if approval is not None and approval.status is HumanApprovalStatus.PENDING:
            pending_approval = PendingApproval(
                approval_id=approval.approval_id,
                reason=approval.reason.value,
                requested_at=approval.requested_at,
                can_decide=actor.role in {Role.OWNER, Role.ADMIN},
            )
        return InvestigationDetail(
            investigation_id=investigation.investigation_id,
            question=investigation.question,
            scenario_key=investigation.scenario_key,
            status=investigation.status,
            version=investigation.version,
            evaluation_attempts=investigation.evaluation_attempts,
            created_at=investigation.created_at,
            updated_at=investigation.updated_at,
            finished_at=investigation.finished_at,
            finding=investigation.finding,
            validation=investigation.validation,
            pending_approval=pending_approval,
            timeline=merged_timeline,
            audit_delivery=delivery,
        )

    @staticmethod
    def _require_create_role(actor: AuthenticatedActor) -> None:
        if actor.role not in {Role.OWNER, Role.ADMIN, Role.MEMBER}:
            raise PermissionDeniedError("This membership cannot start investigations")

    @staticmethod
    def _require_decision_role(actor: AuthenticatedActor) -> None:
        if actor.role not in {Role.OWNER, Role.ADMIN}:
            raise PermissionDeniedError("This membership cannot decide Human Approvals")
