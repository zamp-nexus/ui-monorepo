from datetime import UTC, datetime, timedelta
from uuid import UUID

import pytest
from zentra_domain_agent_execution import ConfidenceOutcome, ValidationOutcome

from zentra_domain_analysis_run import (
    ApprovalDecision,
    EvaluationDirective,
    EvidenceReference,
    Finding,
    HumanApproval,
    HumanApprovalStatus,
    AnalysisRun,
    AnalysisRunStatus,
    AnalysisRunTransitionError,
    MetricComparison,
    RejectionReason,
    directive_for_outcome,
)

CONFIDENCE_THRESHOLD = 0.7

ANALYSIS_RUN_ID = UUID("11000000-0000-0000-0000-000000000001")
TENANT_ID = UUID("22000000-0000-0000-0000-000000000002")
NOW = datetime(2026, 7, 29, 8, 30, tzinfo=UTC)


def finding() -> Finding:
    return Finding(
        headline="EU refund rate increased from 25% to 75%",
        summary="Shipping-delay refunds account for the July increase.",
        metrics=(
            MetricComparison(
                metric="refund_rate",
                previous_value="25",
                current_value="75",
                unit="percent",
            ),
        ),
        evidence_refs=(EvidenceReference("artifact://seed/eu-refund-spike"),),
    )


def validation(*, passed: bool = False) -> ValidationOutcome:
    return ValidationOutcome(
        passed=passed,
        checks=("governed_metrics", "minimum_sample_size"),
        issues=() if passed else ("Only four orders were observed per month.",),
    )


def confidence(score: float) -> ConfidenceOutcome:
    return ConfidenceOutcome(score=score, calibration_method="evaluator_recheck")


def new_analysis_run() -> AnalysisRun:
    return AnalysisRun.create(
        analysis_run_id=ANALYSIS_RUN_ID,
        tenant_id=TENANT_ID,
        question="Why did EU refunds increase from June to July 2026?",
        now=NOW,
    )


@pytest.mark.parametrize(
    ("thread_id", "thread_sequence", "initiating_message_id"),
    [
        (ANALYSIS_RUN_ID, None, None),
        (ANALYSIS_RUN_ID, 0, TENANT_ID),
        (None, 1, TENANT_ID),
    ],
)
def test_thread_link_must_be_complete_with_a_positive_sequence(
    thread_id: UUID | None,
    thread_sequence: int | None,
    initiating_message_id: UUID | None,
) -> None:
    with pytest.raises(AnalysisRunTransitionError):
        AnalysisRun.create(
            analysis_run_id=ANALYSIS_RUN_ID,
            tenant_id=TENANT_ID,
            question="Why did EU refunds increase?",
            now=NOW,
            thread_id=thread_id,
            thread_sequence=thread_sequence,
            initiating_message_id=initiating_message_id,
        )


def test_canonical_analysis_run_requires_human_approval() -> None:
    analysis_run = new_analysis_run()

    analysis_run.start(NOW + timedelta(seconds=1))
    analysis_run.begin_evaluation(NOW + timedelta(seconds=2))
    approval_reason = analysis_run.record_evaluation(
        directive=EvaluationDirective.REVIEW,
        outcome=validation(),
        finding=finding(),
        now=NOW + timedelta(seconds=3),
    )

    assert analysis_run.status is AnalysisRunStatus.AWAITING_APPROVAL
    assert analysis_run.evaluation_attempts == 1
    assert approval_reason == "tenant_policy"
    assert [event.event_type for event in analysis_run.events] == [
        "analysis_run.created",
        "analysis_run.started",
        "analysis_run.evaluation_started",
        "analysis_run.validation_completed",
        "human_approval.requested",
    ]
    assert [event.occurred_at for event in analysis_run.events] == sorted(
        event.occurred_at for event in analysis_run.events
    )
    assert len({event.occurred_at for event in analysis_run.events}) == len(
        analysis_run.events
    )


@pytest.mark.parametrize(
    ("decision", "expected"),
    [
        (ApprovalDecision.APPROVE, AnalysisRunStatus.COMPLETED),
        (ApprovalDecision.REJECT, AnalysisRunStatus.REJECTED),
    ],
)
def test_human_decision_finishes_an_analysis_run(
    decision: ApprovalDecision,
    expected: AnalysisRunStatus,
) -> None:
    analysis_run = new_analysis_run()
    analysis_run.start(NOW)
    analysis_run.begin_evaluation(NOW)
    analysis_run.record_evaluation(
        directive=EvaluationDirective.REVIEW,
        outcome=validation(),
        finding=finding(),
        now=NOW,
    )

    analysis_run.decide(
        decision=decision,
        rejection_reason=(
            RejectionReason.INSUFFICIENT_EVIDENCE
            if decision is ApprovalDecision.REJECT
            else None
        ),
        now=NOW + timedelta(seconds=1),
    )

    assert analysis_run.status is expected
    assert analysis_run.finished_at == NOW + timedelta(seconds=1)


def test_terminal_analysis_run_cannot_transition() -> None:
    analysis_run = new_analysis_run()
    analysis_run.cancel(NOW)

    with pytest.raises(AnalysisRunTransitionError, match="cancelled"):
        analysis_run.start(NOW)


def test_fourth_evaluation_is_rejected() -> None:
    analysis_run = new_analysis_run()
    analysis_run.start(NOW)

    for attempt in range(3):
        analysis_run.begin_evaluation(NOW + timedelta(seconds=attempt))
        analysis_run.record_evaluation(
            directive=EvaluationDirective.RETRY,
            outcome=validation(),
            finding=finding(),
            now=NOW + timedelta(seconds=attempt),
        )

    assert analysis_run.status is AnalysisRunStatus.AWAITING_APPROVAL
    assert analysis_run.evaluation_attempts == 3

    with pytest.raises(AnalysisRunTransitionError, match="awaiting_approval"):
        analysis_run.begin_evaluation(NOW)


@pytest.mark.parametrize(
    ("score", "expected"),
    [
        (0.9, EvaluationDirective.PASS),
        (0.7, EvaluationDirective.PASS),
        (0.5, EvaluationDirective.REVIEW),
    ],
)
def test_confidence_is_compared_against_the_tenant_threshold(
    score: float,
    expected: EvaluationDirective,
) -> None:
    directive = directive_for_outcome(
        confidence(score),
        confidence_threshold=CONFIDENCE_THRESHOLD,
    )

    assert directive is expected


def test_confident_evaluation_completes_without_a_human() -> None:
    analysis_run = new_analysis_run()
    analysis_run.start(NOW)
    analysis_run.begin_evaluation(NOW)

    approval_reason = analysis_run.record_evaluation(
        directive=directive_for_outcome(
            confidence(0.91),
            confidence_threshold=CONFIDENCE_THRESHOLD,
        ),
        outcome=confidence(0.91),
        finding=finding(),
        now=NOW,
    )

    assert approval_reason is None
    assert analysis_run.status is AnalysisRunStatus.COMPLETED
    assert analysis_run.completion is not None
    assert analysis_run.completion.human_approved is False


def test_low_confidence_gates_on_low_confidence_not_tenant_policy() -> None:
    analysis_run = new_analysis_run()
    analysis_run.start(NOW)
    analysis_run.begin_evaluation(NOW)

    approval_reason = analysis_run.record_evaluation(
        directive=directive_for_outcome(
            confidence(0.42),
            confidence_threshold=CONFIDENCE_THRESHOLD,
        ),
        outcome=confidence(0.42),
        finding=finding(),
        now=NOW,
    )

    assert analysis_run.status is AnalysisRunStatus.AWAITING_APPROVAL
    assert approval_reason == "low_confidence"


def test_unconverged_retry_gates_on_contradiction_regardless_of_confidence() -> None:
    analysis_run = new_analysis_run()
    analysis_run.start(NOW)

    for attempt in range(3):
        analysis_run.begin_evaluation(NOW + timedelta(seconds=attempt))
        approval_reason = analysis_run.record_evaluation(
            directive=EvaluationDirective.RETRY,
            outcome=confidence(0.95),
            finding=finding(),
            now=NOW + timedelta(seconds=attempt),
        )

    assert analysis_run.evaluation_attempts == 3
    assert analysis_run.status is AnalysisRunStatus.AWAITING_APPROVAL
    assert approval_reason == "contradiction_unresolved"


def test_evidence_references_must_be_artifacts() -> None:
    with pytest.raises(ValueError, match="artifact://"):
        EvidenceReference("https://example.test/raw-result")


def test_same_decision_is_idempotent_but_conflicting_decision_is_rejected() -> None:
    approval = HumanApproval(
        approval_id=UUID("33000000-0000-0000-0000-000000000003"),
        analysis_run_id=ANALYSIS_RUN_ID,
        tenant_id=TENANT_ID,
        reason="tenant_policy",
        status=HumanApprovalStatus.PENDING,
        requested_at=NOW,
    )

    changed = approval.decide(
        decision=ApprovalDecision.REJECT,
        rejection_reason=RejectionReason.INSUFFICIENT_EVIDENCE,
        user_id=UUID("44000000-0000-0000-0000-000000000004"),
        now=NOW,
    )
    replayed = approval.decide(
        decision=ApprovalDecision.REJECT,
        rejection_reason=RejectionReason.INSUFFICIENT_EVIDENCE,
        user_id=UUID("44000000-0000-0000-0000-000000000004"),
        now=NOW,
    )

    assert changed is True
    assert replayed is False
    with pytest.raises(AnalysisRunTransitionError, match="already decided"):
        approval.decide(
            decision=ApprovalDecision.APPROVE,
            rejection_reason=None,
            user_id=UUID("44000000-0000-0000-0000-000000000004"),
            now=NOW,
        )
