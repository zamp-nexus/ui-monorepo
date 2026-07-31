from __future__ import annotations

from collections.abc import Callable, Sequence
from datetime import datetime
from uuid import UUID

from zentra_domain_agent_execution import (
    ConfidenceOutcome,
    OutcomeSignal,
    independence_of,
)
from zentra_domain_investigation import (
    ApprovalDecision,
    DomainEvent,
    DraftFinding,
    EvaluationDirective,
    EvidenceCitation,
    FailureOutcome,
    HumanApproval,
    HumanApprovalStatus,
    Investigation,
    InvestigationTransitionError,
    RejectionReason,
    confidence_ceiling,
    directive_for_outcome,
)

from .dto import (
    SCENARIOS,
    AuditDelivery,
    AuthenticatedActor,
    ConflictError,
    InvestigationDetail,
    InvestigationNotFoundError,
    PendingApproval,
    PermissionDeniedError,
    PipelineResult,
    Role,
    ScenarioUnavailableError,
    TimelineEntry,
    UnsupportedScenarioError,
)
from .ports import (
    AuditReader,
    AuditWriter,
    InvestigationPipeline,
    InvestigationUnitOfWorkFactory,
)


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
        scenario = SCENARIOS.get(scenario_key)
        if scenario is None:
            raise UnsupportedScenarioError(
                f"Unsupported investigation scenario: {scenario_key}"
            )

        now = self._now()
        investigation = Investigation.create(
            investigation_id=self._new_id(),
            tenant_id=actor.tenant_id,
            question=scenario.question,
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
            if result.draft_finding is not None:
                # Same transaction as the Investigation's own state change, so
                # a reader can never see a completed evaluation whose draft is
                # missing. Stored, not regenerated: a refresh returns this row
                # rather than running Insight again.
                #
                # Citations first: a claim referencing one that is not there
                # yet is a dangling reference for as long as the transaction
                # is open.
                await unit_of_work.citations.add(result.evidence_citations)
                await unit_of_work.draft_findings.add(result.draft_finding)
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
            # Read inside the same tenant-scoped transaction, so RLS decides
            # visibility rather than a second unguarded round trip.
            draft = await unit_of_work.draft_findings.latest_for_investigation(
                investigation_id
            )
            citations = await unit_of_work.citations.for_investigation(
                investigation_id
            )
        return await self._detail(
            actor,
            investigation,
            approval,
            draft_finding=draft,
            evidence_citations=citations,
        )

    async def resolve_citation(
        self,
        actor: AuthenticatedActor,
        *,
        investigation_id: UUID,
        citation_id: UUID,
    ) -> EvidenceCitation:
        """Follow one claim's evidence.

        Tenant identity comes from `actor` and nowhere else — the caller cannot
        name a Tenant, so there is no parameter to get wrong. The transaction
        sets `app.tenant_id` from it, and RLS decides visibility.

        Every way of not being allowed to see this collapses to the same
        answer. "Another Tenant's", "another Investigation's" and "does not
        exist" are indistinguishable on purpose: a caller who can tell them
        apart can confirm that somebody else's evidence exists by copying an
        identifier.
        """
        async with self._unit_of_work_factory(
            actor.tenant_id,
            actor.trace_id,
            actor.span_id,
        ) as unit_of_work:
            # The Investigation first, so a citation id from a readable
            # Investigation cannot be used to probe an unreadable one.
            investigation = await unit_of_work.investigations.get(investigation_id)
            if investigation is None:
                raise InvestigationNotFoundError("Investigation was not found")
            citation = await unit_of_work.citations.resolve(
                investigation_id,
                citation_id,
            )
        if citation is None:
            raise InvestigationNotFoundError("Evidence was not found")
        return citation

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
                draft = await unit_of_work.draft_findings.latest_for_investigation(
                    investigation_id
                )
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
            draft_finding=draft,
            fallback_events=new_events,
            delivered=delivered,
        )

    async def _detail(
        self,
        actor: AuthenticatedActor,
        investigation: Investigation,
        approval: HumanApproval | None,
        *,
        draft_finding: DraftFinding | None = None,
        evidence_citations: tuple[EvidenceCitation, ...] = (),
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
            draft_finding=draft_finding,
            evidence_citations=evidence_citations,
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
