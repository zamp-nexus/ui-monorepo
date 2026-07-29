from __future__ import annotations

from collections.abc import Callable, Sequence
from contextlib import AbstractAsyncContextManager
from dataclasses import dataclass
from datetime import datetime
from enum import StrEnum
from typing import Protocol
from uuid import UUID

from zentra_domain_agent_execution import (
    AgentExecutionRecord,
    ConfidenceOutcome,
    OutcomeSignal,
    independence_of,
)
from zentra_domain_investigation import (
    ApprovalDecision,
    DomainEvent,
    EvaluationDirective,
    FailureOutcome,
    Finding,
    HumanApproval,
    HumanApprovalStatus,
    Investigation,
    InvestigationStatus,
    InvestigationTransitionError,
    RejectionReason,
    confidence_ceiling,
    directive_for_outcome,
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
class PipelineResult:
    """What the agent pipeline established for one investigation."""

    finding: Finding
    outcome: OutcomeSignal
    converged: bool
    contradictions: tuple[str, ...] = ()
    # What actually served each agent, and how many underlying records each
    # counted. The application grades independence and bounds confidence from
    # these rather than trusting the score the models reported.
    analyst_model: str | None = None
    evaluator_model: str | None = None
    analyst_sample_size: int | None = None
    evaluator_sample_size: int | None = None


@dataclass(frozen=True, slots=True)
class TimelineEntry:
    entry_id: UUID
    event_type: str
    status: str
    created_at: datetime
    artifact_refs: tuple[str, ...] = ()
    delivery: AuditDelivery = AuditDelivery.COMPLETE
    agent_id: str | None = None
    step: int | None = None
    model: str | None = None

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
            agent_id=event.metadata.get("agent_id"),
            step=event.metadata.get("step"),
            model=event.metadata.get("model"),
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
    outcome: OutcomeSignal | None
    pending_approval: PendingApproval | None
    timeline: tuple[TimelineEntry, ...]
    audit_delivery: AuditDelivery


class InvestigationPipeline(Protocol):
    async def run(
        self,
        *,
        investigation_id: UUID,
        tenant_id: UUID,
        question: str,
        model_tier: str,
    ) -> PipelineResult: ...


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
    async def add(self, execution: AgentExecutionRecord) -> None: ...


class TenantPolicyRepository(Protocol):
    async def confidence_threshold(self, tenant_id: UUID) -> float: ...

    async def model_tier(self, tenant_id: UUID) -> str: ...


class AuditOutboxRepository(Protocol):
    async def enqueue(self, events: Sequence[DomainEvent]) -> None: ...


class InvestigationUnitOfWork(Protocol):
    investigations: InvestigationRepository
    approvals: HumanApprovalRepository
    agent_executions: AgentExecutionRepository
    policies: TenantPolicyRepository
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
        pipeline: InvestigationPipeline,
        audit_writer: AuditWriter,
        audit_reader: AuditReader,
        now: Callable[[], datetime],
        new_id: Callable[[], UUID],
    ) -> None:
        self._unit_of_work_factory = unit_of_work_factory
        self._pipeline = pipeline
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
        """Register the investigation and return. The agents run afterwards, so
        the caller is not held open for the length of the pipeline."""
        self._require_create_role(actor)
        if scenario_key != SCENARIO_KEY:
            raise UnsupportedScenarioError(
                f"Unsupported investigation scenario: {scenario_key}"
            )

        now = self._now()
        investigation = Investigation.create(
            investigation_id=self._new_id(),
            tenant_id=actor.tenant_id,
            question=CANONICAL_QUESTION,
            scenario_key=scenario_key,
            now=now,
        )
        investigation.start(now)

        async with self._unit_of_work_factory(
            actor.tenant_id,
            actor.trace_id,
            actor.span_id,
        ) as unit_of_work:
            await unit_of_work.investigations.add(investigation)
            await unit_of_work.outbox.enqueue(investigation.events)
            await unit_of_work.commit()

        delivered = await self._audit_writer.flush(
            tenant_id=actor.tenant_id,
            investigation_id=investigation.investigation_id,
        )
        return await self._detail(
            actor,
            investigation,
            None,
            fallback_events=investigation.events,
            delivered=delivered,
        )

    async def execute(self, actor: AuthenticatedActor, investigation_id: UUID) -> None:
        """Run the agent pipeline and apply what it established.

        Individual agent executions are persisted by the pipeline as they
        complete; this applies the terminal result to the aggregate.
        """
        async with self._unit_of_work_factory(
            actor.tenant_id,
            actor.trace_id,
            actor.span_id,
        ) as unit_of_work:
            investigation = await unit_of_work.investigations.get(investigation_id)
            if investigation is None:
                raise InvestigationNotFoundError("Investigation was not found")
            threshold = await unit_of_work.policies.confidence_threshold(
                actor.tenant_id
            )
            model_tier = await unit_of_work.policies.model_tier(actor.tenant_id)

        try:
            result = await self._pipeline.run(
                investigation_id=investigation_id,
                tenant_id=actor.tenant_id,
                question=investigation.question,
                model_tier=model_tier,
            )
        except Exception as error:
            await self._fail(actor, investigation, error)
            raise ScenarioUnavailableError(
                "The investigation pipeline could not complete"
            ) from error

        now = self._now()
        expected_version = investigation.version
        investigation.begin_evaluation(now)
        outcome = _bounded_outcome(result)
        directive = (
            directive_for_outcome(outcome, confidence_threshold=threshold)
            if result.converged and not _sample_sizes_diverge(result)
            # A recheck that never converged, or that counted a wildly
            # different sample from the analyst, is never allowed to
            # auto-publish however confident the final score looks. The loop is
            # already spent by this point, so this escalates rather than retrying.
            else EvaluationDirective.ESCALATE
        )
        approval_reason = investigation.record_evaluation(
            directive=directive,
            outcome=outcome,
            finding=result.finding,
            now=now,
        )
        approval = (
            HumanApproval(
                approval_id=self._new_id(),
                investigation_id=investigation.investigation_id,
                tenant_id=actor.tenant_id,
                reason=approval_reason,
                status=HumanApprovalStatus.PENDING,
                requested_at=now,
            )
            if approval_reason is not None
            else None
        )

        async with self._unit_of_work_factory(
            actor.tenant_id,
            actor.trace_id,
            actor.span_id,
        ) as unit_of_work:
            await unit_of_work.investigations.save(
                investigation,
                expected_version=expected_version,
            )
            if approval is not None:
                await unit_of_work.approvals.add(approval)
            await unit_of_work.outbox.enqueue(investigation.events)
            await unit_of_work.commit()

        await self._audit_writer.flush(
            tenant_id=actor.tenant_id,
            investigation_id=investigation_id,
        )

    async def _fail(
        self,
        actor: AuthenticatedActor,
        investigation: Investigation,
        error: Exception,
    ) -> None:
        expected_version = investigation.version
        investigation.fail(
            FailureOutcome(code="pipeline_failed", message=str(error)),
            self._now(),
        )
        async with self._unit_of_work_factory(
            actor.tenant_id,
            actor.trace_id,
            actor.span_id,
        ) as unit_of_work:
            await unit_of_work.investigations.save(
                investigation,
                expected_version=expected_version,
            )
            await unit_of_work.outbox.enqueue(investigation.events)
            await unit_of_work.commit()
        await self._audit_writer.flush(
            tenant_id=actor.tenant_id,
            investigation_id=investigation.investigation_id,
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
            outcome=investigation.outcome,
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


# A wider gap than this between two independently counted samples is not a
# rounding difference — the agents are describing different things.
_SAMPLE_DIVERGENCE_FACTOR = 2


def _sample_sizes_diverge(result: PipelineResult) -> bool:
    analyst, evaluator = result.analyst_sample_size, result.evaluator_sample_size
    if not analyst or not evaluator:
        return False
    low, high = sorted((analyst, evaluator))
    return high > low * _SAMPLE_DIVERGENCE_FACTOR


def _bounded_outcome(result: PipelineResult) -> OutcomeSignal:
    """Bound the reported confidence by what the evidence and the recheck support.

    Two separate ceilings apply to the same number. How independent the recheck
    actually was — a second call to one model shares its blind spots, however
    differently it words the answer. And how many records the claim rests on —
    four transactions cannot support near-certainty whatever a model asserts.

    The model may always be less confident than these allow, never more, and the
    calibration method records which bound actually bit so Replay shows why a
    number was lowered rather than just showing a lower number.
    """
    outcome = result.outcome
    if not isinstance(outcome, ConfidenceOutcome):
        return outcome

    independence = independence_of(result.analyst_model, result.evaluator_model)
    sample = min(
        filter(None, (result.analyst_sample_size, result.evaluator_sample_size)),
        default=None,
    )
    bounds = (
        (outcome.score, outcome.calibration_method),
        (independence.confidence_ceiling, f"capped_independence_{independence.value}"),
        (confidence_ceiling(sample), "capped_sample_size"),
    )
    score, method = min(bounds, key=lambda bound: bound[0])
    return ConfidenceOutcome(score=score, calibration_method=method)
