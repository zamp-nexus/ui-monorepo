from __future__ import annotations

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from datetime import UTC, datetime
from uuid import UUID

import pytest
from zentra_domain_investigation import (
    ApprovalDecision,
    EvidenceReference,
    Finding,
    HumanApproval,
    Investigation,
    InvestigationValidation,
    MetricComparison,
    RejectionReason,
)

from zentra_application_investigation import (
    AuditDelivery,
    AuthenticatedActor,
    InvestigationNotFoundError,
    InvestigationService,
    PermissionDeniedError,
    Role,
    ScenarioResult,
    UnsupportedScenarioError,
)

TENANT_ID = UUID("51000000-0000-0000-0000-000000000001")
USER_ID = UUID("52000000-0000-0000-0000-000000000002")
INVESTIGATION_ID = UUID("53000000-0000-0000-0000-000000000003")
APPROVAL_ID = UUID("54000000-0000-0000-0000-000000000004")
NOW = datetime(2026, 7, 29, 9, 0, tzinfo=UTC)


class Scenario:
    async def run(self) -> ScenarioResult:
        return ScenarioResult(
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
            validation=InvestigationValidation(
                passed=False,
                checks=("governed_metrics", "minimum_sample_size"),
                issues=("Only four orders were observed per month.",),
            ),
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
    async def add(self, execution: object) -> None:
        raise AssertionError(
            "The deterministic scenario must not create Agent Executions"
        )


class UnitOfWork:
    def __init__(self) -> None:
        self.investigations = Investigations()
        self.approvals = Approvals()
        self.agent_executions = AgentExecutions()
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


def service(unit_of_work: UnitOfWork) -> InvestigationService:
    ids = iter((INVESTIGATION_ID, APPROVAL_ID))
    return InvestigationService(
        unit_of_work_factory=UnitOfWorkFactory(unit_of_work),
        scenario=Scenario(),
        audit_writer=Audit(),
        audit_reader=Audit(),
        now=lambda: NOW,
        new_id=lambda: next(ids),
    )


@pytest.mark.asyncio
async def test_member_starts_seed_scenario_without_an_agent_execution() -> None:
    unit_of_work = UnitOfWork()

    detail = await service(unit_of_work).start(
        actor(Role.MEMBER),
        scenario_key="eu_refund_spike",
    )

    assert detail.status == "awaiting_approval"
    assert detail.validation is not None
    assert detail.validation.passed is False
    assert detail.pending_approval is not None
    assert detail.audit_delivery is AuditDelivery.COMPLETE
    assert unit_of_work.commits == 1
    assert [event.event_type for event in unit_of_work.outbox.events][-1] == (
        "human_approval.requested"
    )


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
    started = await application.start(actor(), scenario_key="eu_refund_spike")
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
