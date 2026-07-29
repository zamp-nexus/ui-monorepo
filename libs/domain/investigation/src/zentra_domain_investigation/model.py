from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timedelta
from enum import StrEnum
from typing import Any
from uuid import UUID, uuid4


class InvestigationStatus(StrEnum):
    PENDING = "pending"
    RUNNING = "running"
    EVALUATING = "evaluating"
    AWAITING_APPROVAL = "awaiting_approval"
    COMPLETED = "completed"
    REJECTED = "rejected"
    FAILED = "failed"
    CANCELLED = "cancelled"


class EvaluationDirective(StrEnum):
    PASS = "pass"
    REVIEW = "review"
    RETRY = "retry"


class ApprovalReason(StrEnum):
    LOW_CONFIDENCE = "low_confidence"
    IRREVERSIBLE_ACTION = "irreversible_action"
    TENANT_POLICY = "tenant_policy"
    CONTRADICTION_UNRESOLVED = "contradiction_unresolved"
    REGULATORY_EXPOSURE = "regulatory_exposure"


class ApprovalDecision(StrEnum):
    APPROVE = "approve"
    REJECT = "reject"


class HumanApprovalStatus(StrEnum):
    PENDING = "pending"
    GRANTED = "granted"
    REJECTED = "rejected"
    TIMED_OUT = "timed_out"


class RejectionReason(StrEnum):
    INSUFFICIENT_EVIDENCE = "insufficient_evidence"
    INCORRECT_INTERPRETATION = "incorrect_interpretation"
    POLICY_MISMATCH = "policy_mismatch"
    NEEDS_MORE_ANALYSIS = "needs_more_analysis"


class InvestigationTransitionError(ValueError):
    pass


@dataclass(frozen=True, slots=True)
class EvidenceReference:
    value: str

    def __post_init__(self) -> None:
        if not self.value.startswith("artifact://"):
            raise ValueError("Evidence references must use the artifact:// scheme")


@dataclass(frozen=True, slots=True)
class MetricComparison:
    metric: str
    previous_value: str
    current_value: str
    unit: str


@dataclass(frozen=True, slots=True)
class Finding:
    headline: str
    summary: str
    metrics: tuple[MetricComparison, ...]
    evidence_refs: tuple[EvidenceReference, ...]


@dataclass(frozen=True, slots=True)
class InvestigationValidation:
    passed: bool
    checks: tuple[str, ...] = ()
    issues: tuple[str, ...] = ()


@dataclass(frozen=True, slots=True)
class CompletionOutcome:
    finding: Finding
    human_approved: bool


@dataclass(frozen=True, slots=True)
class FailureOutcome:
    code: str
    message: str


@dataclass(frozen=True, slots=True)
class DomainEvent:
    event_id: UUID
    event_type: str
    investigation_id: UUID
    tenant_id: UUID
    status: InvestigationStatus
    occurred_at: datetime
    artifact_refs: tuple[EvidenceReference, ...] = ()
    metadata: dict[str, Any] = field(default_factory=dict)


@dataclass(slots=True)
class HumanApproval:
    approval_id: UUID
    investigation_id: UUID
    tenant_id: UUID
    reason: ApprovalReason
    status: HumanApprovalStatus
    requested_at: datetime
    decided_at: datetime | None = None
    decided_by: UUID | None = None
    decision_reason: RejectionReason | None = None

    def decide(
        self,
        *,
        decision: ApprovalDecision,
        rejection_reason: RejectionReason | None,
        user_id: UUID,
        now: datetime,
    ) -> bool:
        target = (
            HumanApprovalStatus.GRANTED
            if decision is ApprovalDecision.APPROVE
            else HumanApprovalStatus.REJECTED
        )
        if self.status is target and self.decision_reason is rejection_reason:
            return False
        if self.status is not HumanApprovalStatus.PENDING:
            raise InvestigationTransitionError(
                f"Approval was already decided as {self.status.value}"
            )
        if decision is ApprovalDecision.REJECT and rejection_reason is None:
            raise InvestigationTransitionError("A rejection reason is required")
        if decision is ApprovalDecision.APPROVE and rejection_reason is not None:
            raise InvestigationTransitionError(
                "An approval cannot include a rejection reason"
            )

        self.status = target
        self.decided_at = now
        self.decided_by = user_id
        self.decision_reason = rejection_reason
        return True


@dataclass(slots=True)
class Investigation:
    investigation_id: UUID
    tenant_id: UUID
    question: str
    scenario_key: str
    status: InvestigationStatus
    version: int
    evaluation_attempts: int
    created_at: datetime
    updated_at: datetime
    finished_at: datetime | None = None
    finding: Finding | None = None
    validation: InvestigationValidation | None = None
    completion: CompletionOutcome | None = None
    failure: FailureOutcome | None = None
    events: list[DomainEvent] = field(default_factory=list)

    @classmethod
    def create(
        cls,
        *,
        investigation_id: UUID,
        tenant_id: UUID,
        question: str,
        scenario_key: str,
        now: datetime,
    ) -> Investigation:
        investigation = cls(
            investigation_id=investigation_id,
            tenant_id=tenant_id,
            question=question,
            scenario_key=scenario_key,
            status=InvestigationStatus.PENDING,
            version=1,
            evaluation_attempts=0,
            created_at=now,
            updated_at=now,
        )
        investigation._record("investigation.created", now)
        return investigation

    def start(self, now: datetime) -> None:
        self._transition(
            expected={InvestigationStatus.PENDING},
            target=InvestigationStatus.RUNNING,
            event_type="investigation.started",
            now=now,
        )

    def begin_evaluation(self, now: datetime) -> None:
        self._transition(
            expected={InvestigationStatus.RUNNING},
            target=InvestigationStatus.EVALUATING,
            event_type="investigation.evaluation_started",
            now=now,
        )

    def record_evaluation(
        self,
        *,
        directive: EvaluationDirective,
        validation: InvestigationValidation,
        finding: Finding,
        now: datetime,
    ) -> ApprovalReason | None:
        self._require_status({InvestigationStatus.EVALUATING})
        if self.evaluation_attempts >= 3:
            raise InvestigationTransitionError(
                "An investigation cannot exceed three evaluation attempts"
            )

        self.evaluation_attempts += 1
        self.validation = validation
        self.finding = finding
        self.updated_at = now
        self.version += 1
        self._record(
            "investigation.validation_completed",
            now,
            artifact_refs=finding.evidence_refs,
            metadata={
                "attempt": self.evaluation_attempts,
                "directive": directive.value,
                "passed": validation.passed,
            },
        )

        if directive is EvaluationDirective.PASS:
            self._complete(now, human_approved=False)
            return None

        if directive is EvaluationDirective.RETRY and self.evaluation_attempts < 3:
            self._transition(
                expected={InvestigationStatus.EVALUATING},
                target=InvestigationStatus.RUNNING,
                event_type="investigation.retry_requested",
                now=now,
            )
            return None

        reason = (
            ApprovalReason.CONTRADICTION_UNRESOLVED
            if directive is EvaluationDirective.RETRY
            else ApprovalReason.TENANT_POLICY
        )
        self._transition(
            expected={InvestigationStatus.EVALUATING},
            target=InvestigationStatus.AWAITING_APPROVAL,
            event_type="human_approval.requested",
            now=now,
            metadata={"reason": reason.value},
        )
        return reason

    def decide(
        self,
        *,
        decision: ApprovalDecision,
        rejection_reason: RejectionReason | None,
        now: datetime,
    ) -> None:
        self._require_status({InvestigationStatus.AWAITING_APPROVAL})
        if decision is ApprovalDecision.REJECT and rejection_reason is None:
            raise InvestigationTransitionError("A rejection reason is required")
        if decision is ApprovalDecision.APPROVE and rejection_reason is not None:
            raise InvestigationTransitionError(
                "An approval cannot include a rejection reason"
            )

        if decision is ApprovalDecision.APPROVE:
            self._record("human_approval.granted", now)
            self._complete(now, human_approved=True)
            return

        self._record(
            "human_approval.rejected",
            now,
            metadata={"reason": rejection_reason.value},
        )
        self._transition(
            expected={InvestigationStatus.AWAITING_APPROVAL},
            target=InvestigationStatus.REJECTED,
            event_type="investigation.rejected",
            now=now,
            finished=True,
        )

    def fail(self, failure: FailureOutcome, now: datetime) -> None:
        self._require_status(
            {
                InvestigationStatus.PENDING,
                InvestigationStatus.RUNNING,
                InvestigationStatus.EVALUATING,
            }
        )
        self.failure = failure
        self._transition(
            expected={self.status},
            target=InvestigationStatus.FAILED,
            event_type="investigation.failed",
            now=now,
            metadata={"code": failure.code},
            finished=True,
        )

    def cancel(self, now: datetime) -> None:
        self._require_status(
            {
                InvestigationStatus.PENDING,
                InvestigationStatus.RUNNING,
                InvestigationStatus.EVALUATING,
                InvestigationStatus.AWAITING_APPROVAL,
            }
        )
        self._transition(
            expected={self.status},
            target=InvestigationStatus.CANCELLED,
            event_type="investigation.cancelled",
            now=now,
            finished=True,
        )

    def _complete(self, now: datetime, *, human_approved: bool) -> None:
        if self.finding is None:
            raise InvestigationTransitionError(
                "An investigation cannot complete without a finding"
            )
        self.completion = CompletionOutcome(
            finding=self.finding,
            human_approved=human_approved,
        )
        self._transition(
            expected={
                InvestigationStatus.EVALUATING,
                InvestigationStatus.AWAITING_APPROVAL,
            },
            target=InvestigationStatus.COMPLETED,
            event_type="investigation.completed",
            now=now,
            finished=True,
        )

    def _require_status(self, expected: set[InvestigationStatus]) -> None:
        if self.status not in expected:
            allowed = ", ".join(sorted(status.value for status in expected))
            raise InvestigationTransitionError(
                f"Cannot transition investigation from {self.status.value}; "
                f"expected {allowed}"
            )

    def _transition(
        self,
        *,
        expected: set[InvestigationStatus],
        target: InvestigationStatus,
        event_type: str,
        now: datetime,
        metadata: dict[str, Any] | None = None,
        finished: bool = False,
    ) -> None:
        self._require_status(expected)
        self.status = target
        self.updated_at = now
        self.version += 1
        if finished:
            self.finished_at = now
        self._record(event_type, now, metadata=metadata)

    def _record(
        self,
        event_type: str,
        now: datetime,
        *,
        artifact_refs: tuple[EvidenceReference, ...] = (),
        metadata: dict[str, Any] | None = None,
    ) -> None:
        occurred_at = now
        if self.events and occurred_at <= self.events[-1].occurred_at:
            occurred_at = self.events[-1].occurred_at + timedelta(microseconds=1)
        self.events.append(
            DomainEvent(
                event_id=uuid4(),
                event_type=event_type,
                investigation_id=self.investigation_id,
                tenant_id=self.tenant_id,
                status=self.status,
                occurred_at=occurred_at,
                artifact_refs=artifact_refs,
                metadata=metadata or {},
            )
        )
