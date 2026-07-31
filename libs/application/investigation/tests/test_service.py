from __future__ import annotations

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from datetime import UTC, datetime
from uuid import UUID

import pytest
from zentra_domain_agent_execution import ConfidenceOutcome
from zentra_domain_investigation import (
    ApprovalDecision,
    Claim,
    ClaimKind,
    DraftFinding,
    EvidenceReference,
    Finding,
    HumanApproval,
    Investigation,
    MetricComparison,
    RejectionReason,
    RootCauseState,
)

from zentra_application_investigation import (
    AuditDelivery,
    AuthenticatedActor,
    InvestigationDetail,
    InvestigationNotFoundError,
    InvestigationService,
    PermissionDeniedError,
    PipelineResult,
    Role,
    UnsupportedScenarioError,
)

TENANT_ID = UUID("51000000-0000-0000-0000-000000000001")
USER_ID = UUID("52000000-0000-0000-0000-000000000002")
INVESTIGATION_ID = UUID("53000000-0000-0000-0000-000000000003")
APPROVAL_ID = UUID("54000000-0000-0000-0000-000000000004")
NOW = datetime(2026, 7, 29, 9, 0, tzinfo=UTC)


class Pipeline:
    def __init__(
        self,
        *,
        score: float = 0.42,
        converged: bool = True,
        analyst_model: str = "gemini/gemini-3.6-flash",
        evaluator_model: str = "nvidia/nemotron-3-ultra-550b-a55b",
        analyst_sample_size: int | None = 500,
        evaluator_sample_size: int | None = 500,
        draft_finding: DraftFinding | None = None,
    ) -> None:
        self._draft_finding = draft_finding
        self._score = score
        self._converged = converged
        self._analyst_model = analyst_model
        self._evaluator_model = evaluator_model
        self._analyst_sample = analyst_sample_size
        self._evaluator_sample = evaluator_sample_size
        self.calls: list[UUID] = []

    async def run(
        self,
        *,
        investigation_id: UUID,
        tenant_id: UUID,
        question: str,
        model_tier: str = "free",
    ) -> PipelineResult:
        self.calls.append(investigation_id)
        return PipelineResult(
            finding=Finding(
                headline="EU refund rate increased from 25% to 75%",
                summary="Shipping-delay refunds account for the July increase.",
                metrics=(
                    MetricComparison("order_count", "4", "4", "orders"),
                    MetricComparison("refund_amount", "20.00", "260.00", "usd"),
                    MetricComparison("refund_rate", "25", "75", "percent"),
                ),
                evidence_refs=(
                    EvidenceReference("artifact://seed/eu-refund-spike/2026-06-07"),
                ),
            ),
            outcome=ConfidenceOutcome(
                score=self._score,
                calibration_method="evaluator_independent_recheck",
            ),
            converged=self._converged,
            analyst_model=self._analyst_model,
            evaluator_model=self._evaluator_model,
            analyst_sample_size=self._analyst_sample,
            evaluator_sample_size=self._evaluator_sample,
            draft_finding=self._draft_finding,
        )


class Investigations:
    def __init__(self) -> None:
        self.rows: dict[UUID, Investigation] = {}

    async def add(self, investigation: Investigation) -> None:
        self.rows[investigation.investigation_id] = investigation

    async def get(
        self, investigation_id: UUID, *, for_update: bool = False
    ) -> Investigation | None:
        return self.rows.get(investigation_id)

    async def save(
        self,
        investigation: Investigation,
        *,
        expected_version: int,
    ) -> None:
        assert investigation.version > expected_version
        self.rows[investigation.investigation_id] = investigation


class Approvals:
    def __init__(self) -> None:
        self.rows: dict[UUID, HumanApproval] = {}

    async def add(self, approval: HumanApproval) -> None:
        self.rows[approval.approval_id] = approval

    async def get_for_investigation(
        self,
        investigation_id: UUID,
        *,
        approval_id: UUID | None = None,
        for_update: bool = False,
    ) -> HumanApproval | None:
        matches = [
            approval
            for approval in self.rows.values()
            if approval.investigation_id == investigation_id
            and (approval_id is None or approval.approval_id == approval_id)
        ]
        return matches[0] if matches else None

    async def save(self, approval: HumanApproval) -> None:
        self.rows[approval.approval_id] = approval


class Outbox:
    def __init__(self) -> None:
        self.events = []

    async def enqueue(self, events) -> None:
        self.events.extend(events)


class AgentExecutions:
    def __init__(self) -> None:
        self.rows: list[object] = []

    async def add(self, execution: object) -> None:
        self.rows.append(execution)


class DraftFindings:
    def __init__(self) -> None:
        self.rows: dict[UUID, object] = {}

    async def add(self, draft: object) -> None:
        self.rows[draft.investigation_id] = draft

    async def latest_for_investigation(self, investigation_id: UUID) -> object | None:
        return self.rows.get(investigation_id)


class Policies:
    def __init__(self, threshold: float = 0.7, tier: str = "free") -> None:
        self.threshold = threshold
        self.tier = tier

    async def confidence_threshold(self, tenant_id: UUID) -> float:
        return self.threshold

    async def model_tier(self, tenant_id: UUID) -> str:
        return self.tier


class UnitOfWork:
    def __init__(self) -> None:
        self.investigations = Investigations()
        self.approvals = Approvals()
        self.agent_executions = AgentExecutions()
        self.draft_findings = DraftFindings()
        self.policies = Policies()
        self.outbox = Outbox()
        self.commits = 0

    async def commit(self) -> None:
        self.commits += 1


class UnitOfWorkFactory:
    def __init__(self, unit_of_work: UnitOfWork) -> None:
        self.unit_of_work = unit_of_work
        self.tenant_ids: list[UUID] = []

    @asynccontextmanager
    async def __call__(
        self,
        tenant_id: UUID,
        trace_id: UUID,
        span_id: UUID,
    ) -> AsyncIterator[UnitOfWork]:
        self.tenant_ids.append(tenant_id)
        yield self.unit_of_work


class Audit:
    async def flush(self, *, tenant_id: UUID, investigation_id: UUID) -> bool:
        return True

    async def list_timeline(self, *, tenant_id: UUID, investigation_id: UUID):
        return ()


def actor(role: Role = Role.OWNER) -> AuthenticatedActor:
    return AuthenticatedActor(
        user_id=USER_ID,
        tenant_id=TENANT_ID,
        role=role,
        trace_id=UUID("55000000-0000-0000-0000-000000000005"),
        span_id=UUID("56000000-0000-0000-0000-000000000006"),
    )


def service(
    unit_of_work: UnitOfWork,
    *,
    pipeline: Pipeline | None = None,
) -> InvestigationService:
    ids = iter((INVESTIGATION_ID, APPROVAL_ID))
    return InvestigationService(
        unit_of_work_factory=UnitOfWorkFactory(unit_of_work),
        pipeline=pipeline or Pipeline(),
        audit_writer=Audit(),
        audit_reader=Audit(),
        now=lambda: NOW,
        new_id=lambda: next(ids),
    )


@pytest.mark.asyncio
async def test_start_returns_running_before_the_agents_have_run() -> None:
    unit_of_work = UnitOfWork()

    detail = await service(unit_of_work).start(
        actor(Role.MEMBER),
        scenario_key="eu_refund_spike",
    )

    assert detail.status == "running"
    assert detail.outcome is None
    assert detail.pending_approval is None
    assert detail.audit_delivery is AuditDelivery.COMPLETE
    assert unit_of_work.commits == 1
    assert [event.event_type for event in unit_of_work.outbox.events] == [
        "investigation.created",
        "investigation.started",
    ]


@pytest.mark.asyncio
async def test_low_confidence_gates_on_a_human_rather_than_publishing() -> None:
    unit_of_work = UnitOfWork()
    application = service(unit_of_work, pipeline=Pipeline(score=0.42))

    await application.start(actor(), scenario_key="eu_refund_spike")
    await application.execute(actor(), INVESTIGATION_ID)
    detail = await application.get(actor(), INVESTIGATION_ID)

    assert detail.status == "awaiting_approval"
    assert detail.pending_approval is not None
    assert detail.pending_approval.reason == "low_confidence"
    assert isinstance(detail.outcome, ConfidenceOutcome)
    assert detail.outcome.score == 0.42


@pytest.mark.asyncio
async def test_confident_converged_result_completes_without_a_human() -> None:
    unit_of_work = UnitOfWork()
    application = service(unit_of_work, pipeline=Pipeline(score=0.91))

    await application.start(actor(), scenario_key="eu_refund_spike")
    await application.execute(actor(), INVESTIGATION_ID)
    detail = await application.get(actor(), INVESTIGATION_ID)

    assert detail.status == "completed"
    assert detail.pending_approval is None


@pytest.mark.asyncio
async def test_unconverged_recheck_gates_even_when_confidence_is_high() -> None:
    unit_of_work = UnitOfWork()
    application = service(
        unit_of_work,
        pipeline=Pipeline(score=0.95, converged=False),
    )

    await application.start(actor(), scenario_key="eu_refund_spike")
    await application.execute(actor(), INVESTIGATION_ID)
    detail = await application.get(actor(), INVESTIGATION_ID)

    assert detail.status == "awaiting_approval"
    assert detail.pending_approval is not None
    assert detail.pending_approval.reason == "contradiction_unresolved"


@pytest.mark.asyncio
async def test_viewer_cannot_start_and_unsupported_scenarios_are_rejected() -> None:
    unit_of_work = UnitOfWork()
    application = service(unit_of_work)

    with pytest.raises(PermissionDeniedError):
        await application.start(actor(Role.VIEWER), scenario_key="eu_refund_spike")
    with pytest.raises(UnsupportedScenarioError):
        await application.start(actor(), scenario_key="free_form")


@pytest.mark.asyncio
async def test_owner_decision_is_idempotent_and_member_cannot_decide() -> None:
    unit_of_work = UnitOfWork()
    application = service(unit_of_work)
    await application.start(actor(), scenario_key="eu_refund_spike")
    await application.execute(actor(), INVESTIGATION_ID)
    started = await application.get(actor(), INVESTIGATION_ID)
    assert started.pending_approval is not None

    with pytest.raises(PermissionDeniedError):
        await application.decide(
            actor(Role.MEMBER),
            investigation_id=INVESTIGATION_ID,
            approval_id=APPROVAL_ID,
            decision=ApprovalDecision.APPROVE,
            rejection_reason=None,
        )

    first = await application.decide(
        actor(),
        investigation_id=INVESTIGATION_ID,
        approval_id=APPROVAL_ID,
        decision=ApprovalDecision.REJECT,
        rejection_reason=RejectionReason.INSUFFICIENT_EVIDENCE,
    )
    replay = await application.decide(
        actor(),
        investigation_id=INVESTIGATION_ID,
        approval_id=APPROVAL_ID,
        decision=ApprovalDecision.REJECT,
        rejection_reason=RejectionReason.INSUFFICIENT_EVIDENCE,
    )

    assert first.status == "rejected"
    assert replay.status == "rejected"


@pytest.mark.asyncio
async def test_invisible_investigation_returns_not_found() -> None:
    with pytest.raises(InvestigationNotFoundError):
        await service(UnitOfWork()).get(actor(Role.VIEWER), INVESTIGATION_ID)


async def outcome_of(pipeline: Pipeline) -> InvestigationDetail:
    application = service(UnitOfWork(), pipeline=pipeline)
    await application.start(actor(), scenario_key="eu_refund_spike")
    await application.execute(actor(), INVESTIGATION_ID)
    return await application.get(actor(), INVESTIGATION_ID)


@pytest.mark.asyncio
async def test_same_model_on_both_agents_gates_however_confident() -> None:
    """What fallback actually produced live: the chain collapsed and Gemini
    checked itself. A second pass by one model is not a second opinion."""
    detail = await outcome_of(
        Pipeline(
            score=0.95,
            analyst_model="gemini/gemini-3.6-flash",
            evaluator_model="gemini/gemini-3.6-flash",
        )
    )

    assert detail.status == "awaiting_approval"
    assert detail.pending_approval is not None
    assert detail.pending_approval.reason == "low_confidence"
    assert isinstance(detail.outcome, ConfidenceOutcome)
    assert detail.outcome.score == 0.5
    assert detail.outcome.calibration_method == "capped_independence_none"


@pytest.mark.asyncio
async def test_same_family_may_publish_but_never_at_near_certainty() -> None:
    """Opus checking Sonnet is a real second opinion, so premium is not
    blanket-gated — but they share a training philosophy, so it is bounded."""
    detail = await outcome_of(
        Pipeline(
            score=0.98,
            analyst_model="claude-sonnet-5",
            evaluator_model="claude-opus-5",
        )
    )

    assert detail.status == "completed"
    assert isinstance(detail.outcome, ConfidenceOutcome)
    assert detail.outcome.score == 0.85
    assert detail.outcome.calibration_method == "capped_independence_partial"


@pytest.mark.asyncio
async def test_small_sample_gates_however_confident_the_models_were() -> None:
    """The live regression: Gemini reported 0.95 over eight orders and
    auto-published, where Claude reported 0.55 on the same data and gated."""
    detail = await outcome_of(
        Pipeline(score=0.95, analyst_sample_size=8, evaluator_sample_size=8)
    )

    assert detail.status == "awaiting_approval"
    assert detail.pending_approval is not None
    assert detail.pending_approval.reason == "low_confidence"
    assert isinstance(detail.outcome, ConfidenceOutcome)
    assert detail.outcome.score == 0.65
    assert detail.outcome.calibration_method == "capped_sample_size"


@pytest.mark.asyncio
async def test_the_lower_of_two_independently_counted_samples_is_used() -> None:
    detail = await outcome_of(
        Pipeline(score=0.95, analyst_sample_size=120, evaluator_sample_size=90)
    )

    # 90 lands in the under-100 band, not 120's unbounded one.
    assert isinstance(detail.outcome, ConfidenceOutcome)
    assert detail.outcome.score == 0.85


@pytest.mark.asyncio
async def test_wildly_divergent_sample_counts_gate_as_a_contradiction() -> None:
    detail = await outcome_of(
        Pipeline(score=0.95, analyst_sample_size=500, evaluator_sample_size=40)
    )

    assert detail.status == "awaiting_approval"
    assert detail.pending_approval is not None
    assert detail.pending_approval.reason == "contradiction_unresolved"


@pytest.mark.asyncio
async def test_a_well_evidenced_independent_result_still_publishes() -> None:
    """The ceilings must not simply block everything."""
    detail = await outcome_of(Pipeline(score=0.92))

    assert detail.status == "completed"
    assert isinstance(detail.outcome, ConfidenceOutcome)
    assert detail.outcome.score == 0.92


@pytest.mark.asyncio
async def test_a_second_scenario_carries_its_own_question() -> None:
    """The question is looked up from the registry, not a module constant, so
    each scenario reaches the agents with the wording it was written for."""
    application = service(UnitOfWork())

    detail = await application.start(actor(), scenario_key="na_channel_growth")

    assert detail.scenario_key == "na_channel_growth"
    assert "sales channel" in detail.question
    assert "North America" in detail.question


@pytest.mark.asyncio
async def test_an_unregistered_scenario_is_still_refused() -> None:
    application = service(UnitOfWork())

    with pytest.raises(UnsupportedScenarioError):
        await application.start(actor(), scenario_key="made_up_scenario")


def structured_draft() -> DraftFinding:
    return DraftFinding(
        draft_finding_id=UUID("90000000-0000-0000-0000-000000000001"),
        tenant_id=TENANT_ID,
        investigation_id=INVESTIGATION_ID,
        version=1,
        created_at=NOW,
        produced_by_execution_id=UUID("91000000-0000-0000-0000-000000000001"),
        headline="EU refund rate increased from 25% to 75%",
        summary="Governed EU refund amount rose from $20 to $260.",
        claims=(
            Claim(
                claim_id=UUID("92000000-0000-0000-0000-000000000001"),
                kind=ClaimKind.OBSERVED,
                text="EU refund amount rose to $260.00.",
                position=0,
            ),
        ),
        contradictions=(),
        root_cause=RootCauseState.UNRESOLVED,
        confidence=ConfidenceOutcome(
            score=0.42,
            calibration_method="insight_bounded_by_evaluator",
        ),
    )


@pytest.mark.asyncio
async def test_a_drafted_investigation_stores_the_draft_with_its_state_change(
) -> None:
    """Committed alongside the Investigation's own change. A reader must never
    see a completed evaluation whose draft is missing."""
    unit_of_work = UnitOfWork()
    draft = structured_draft()
    application = service(unit_of_work, pipeline=Pipeline(draft_finding=draft))

    await application.start(actor(), scenario_key="eu_refund_spike")
    await application.execute(actor(), INVESTIGATION_ID)

    assert unit_of_work.draft_findings.rows[INVESTIGATION_ID] is draft


@pytest.mark.asyncio
async def test_a_refresh_returns_the_stored_draft_without_rerunning_insight(
) -> None:
    """Insight is a paid model call, and regenerating narrative per read would
    let two readers of the same Investigation see different conclusions."""
    unit_of_work = UnitOfWork()
    draft = structured_draft()
    pipeline = Pipeline(draft_finding=draft)
    application = service(unit_of_work, pipeline=pipeline)

    await application.start(actor(), scenario_key="eu_refund_spike")
    await application.execute(actor(), INVESTIGATION_ID)
    runs_after_execute = len(pipeline.calls)

    first = await application.get(actor(), INVESTIGATION_ID)
    second = await application.get(actor(), INVESTIGATION_ID)

    assert first.draft_finding is draft
    assert second.draft_finding is draft
    assert first.draft_finding.claims[0].position == 0
    assert len(pipeline.calls) == runs_after_execute


@pytest.mark.asyncio
async def test_the_phase_1_path_stores_no_draft_and_stays_readable() -> None:
    unit_of_work = UnitOfWork()
    application = service(unit_of_work, pipeline=Pipeline())

    await application.start(actor(), scenario_key="eu_refund_spike")
    await application.execute(actor(), INVESTIGATION_ID)
    detail = await application.get(actor(), INVESTIGATION_ID)

    assert unit_of_work.draft_findings.rows == {}
    assert detail.draft_finding is None
    assert detail.finding is not None
