from __future__ import annotations

from collections.abc import Mapping
from datetime import UTC, datetime
from uuid import UUID, uuid4, uuid5

from zentra_adapter_langgraph import InsightOutcome, InvestigationGraph
from zentra_adapter_model_providers import ModelTier
from zentra_adapter_postgres import PostgresInvestigationUnitOfWorkFactory
from zentra_application_investigation import PipelineResult
from zentra_domain_agent_execution import (
    AgentExecutionRecord,
    AgentExecutionStart,
    ConfidenceOutcome,
    ExecutionStatus,
    reject_legacy_role,
)
from zentra_domain_investigation import (
    Claim,
    ClaimKind,
    Contradiction,
    DomainEvent,
    DraftFinding,
    EvidenceReference,
    Finding,
    InvestigationStatus,
    MetricComparison,
    RootCauseState,
)

SYSTEM_TRACE_ID = UUID(int=0)
SYSTEM_SPAN_ID = UUID(int=0)

# The completion event already uses the execution id as its event id, and
# the outbox deduplicates on that. Deriving the start's id keeps both
# stable across an at-least-once retry without colliding with each other.
_STARTED_NAMESPACE = UUID("5f9d1e3a-0000-4000-8000-000000000001")


def _optional_str(value: object) -> str | None:
    """A blank label is no label. A model that emits "" has said nothing, and
    stringifying it would caption a metric with an empty period."""
    if value is None:
        return None
    text = str(value).strip()
    return text or None


class PostgresExecutionRecorder:
    """Commits each agent execution as it finishes.

    Persisting per step rather than at the end is what makes an interrupted
    investigation replayable up to the point it stopped.
    """

    def __init__(
        self,
        unit_of_work_factory: PostgresInvestigationUnitOfWorkFactory,
    ) -> None:
        self._unit_of_work_factory = unit_of_work_factory

    async def record_started(self, start: AgentExecutionStart) -> None:
        reject_legacy_role(start.role)
        async with self._unit_of_work_factory(
            start.tenant_id,
            SYSTEM_TRACE_ID,
            SYSTEM_SPAN_ID,
        ) as unit_of_work:
            await unit_of_work.outbox.enqueue([_started_event(start)])
            await unit_of_work.commit()

    async def record(self, execution: AgentExecutionRecord) -> None:
        # Before the transaction opens. The role travels into the audit
        # ledger's metadata, and Audit Entries are immutable — a legacy value
        # written there could never be corrected.
        reject_legacy_role(execution.role)
        async with self._unit_of_work_factory(
            execution.tenant_id,
            SYSTEM_TRACE_ID,
            SYSTEM_SPAN_ID,
        ) as unit_of_work:
            await unit_of_work.agent_executions.add(execution)
            # Same transaction as the row itself, so the ledger can never
            # disagree with what was actually persisted.
            await unit_of_work.outbox.enqueue([_audit_event(execution)])
            await unit_of_work.commit()


def _started_event(start: AgentExecutionStart) -> DomainEvent:
    """Identity and position only.

    There is nothing to say about the work yet — no outcome, no usage, no
    evidence. Saying only that it began is the whole point.
    """
    return DomainEvent(
        event_id=uuid5(_STARTED_NAMESPACE, str(start.execution_id)),
        event_type="agent.execution_started",
        investigation_id=start.investigation_id,
        tenant_id=start.tenant_id,
        status=InvestigationStatus.RUNNING,
        occurred_at=start.started_at,
        metadata={
            "agent_id": start.agent_id,
            "role": start.role.value,
            "step": start.step,
            "execution_id": str(start.execution_id),
        },
    )


def _audit_event(execution: AgentExecutionRecord) -> DomainEvent:
    """Process metadata and artifact pointers only.

    The agent's actual output — including result rows — stays in Postgres and
    is reachable solely through the `artifact://` reference carried here.
    """
    return DomainEvent(
        event_id=execution.execution_id,
        event_type=(
            "agent.execution_completed"
            if execution.status is ExecutionStatus.SUCCESS
            else "agent.execution_failed"
        ),
        investigation_id=execution.investigation_id,
        tenant_id=execution.tenant_id,
        status=InvestigationStatus.RUNNING,
        occurred_at=execution.completed_at,
        artifact_refs=tuple(
            EvidenceReference(reference) for reference in execution.evidence_refs
        ),
        metadata={
            "agent_id": execution.agent_id,
            "role": execution.role.value,
            "step": execution.step,
            "execution_id": str(execution.execution_id),
            "execution_status": execution.status.value,
            "latency_ms": execution.latency_ms,
            "input_tokens": execution.usage.input_tokens,
            "output_tokens": execution.usage.output_tokens,
            "total_cost_usd": str(execution.usage.cost_usd),
            "model": execution.usage.model,
            "outcome_kind": execution.outcome.kind if execution.outcome else None,
            "confidence": execution.confidence,
            "errors": list(execution.errors),
            # Which rungs failed before this one answered. Process metadata, so
            # it belongs in the ledger, and it is how the next provider outage
            # gets diagnosed from Replay instead of by hand.
            "fallbacks": list(execution.fallbacks),
        },
    )


class LangGraphInvestigationPipeline:
    """Adapts the agent graph's outcome to what the application expects.

    Holds one compiled graph per tier — two at most — so the tenant's tier
    never has to travel through `ModelPort.complete()`.
    """

    def __init__(self, graphs: Mapping[ModelTier, InvestigationGraph]) -> None:
        self._graphs = dict(graphs)

    async def run(
        self,
        *,
        investigation_id: UUID,
        tenant_id: UUID,
        question: str,
        model_tier: str = ModelTier.FREE.value,
    ) -> PipelineResult:
        graph = self._graphs[ModelTier(model_tier)]
        outcome = await graph.run(
            investigation_id=investigation_id,
            tenant_id=tenant_id,
            question=question,
        )
        return PipelineResult(
            finding=Finding(
                headline=outcome.headline,
                summary=outcome.summary,
                metrics=tuple(
                    MetricComparison(
                        metric=str(metric["metric"]),
                        previous_value=str(metric["previous_value"]),
                        current_value=str(metric["current_value"]),
                        unit=str(metric["unit"]),
                        previous_label=_optional_str(metric.get("previous_label")),
                        current_label=_optional_str(metric.get("current_label")),
                    )
                    for metric in outcome.metrics
                ),
                evidence_refs=tuple(
                    EvidenceReference(reference) for reference in outcome.evidence_refs
                ),
            ),
            outcome=outcome.outcome,
            converged=outcome.converged,
            contradictions=outcome.contradictions,
            # The evidence the application needs to bound the confidence: which
            # models actually served, and how much data each one counted.
            analyst_model=outcome.analyst_model,
            evaluator_model=outcome.evaluator_model,
            analyst_sample_size=outcome.analyst_sample_size,
            evaluator_sample_size=outcome.evaluator_sample_size,
            draft_finding=_draft_finding(
                outcome.insight,
                investigation_id=investigation_id,
                tenant_id=tenant_id,
            ),
        )


def _draft_finding(
    insight: InsightOutcome | None,
    *,
    investigation_id: UUID,
    tenant_id: UUID,
) -> DraftFinding | None:
    """Assemble the domain object from what the Insight execution reported.

    Here rather than in the graph adapter, because building an Investigation
    domain object is not the agent runtime's job — and because this is the
    layer that already knows both sides.

    The claim ordering is the agent's, preserved by position. `root_cause`
    passes through `RootCauseState` rather than being hardcoded here, so if the
    accepted causal-evidence standard ever adds a second state this converts it
    instead of silently reporting the wrong one.
    """
    if insight is None:
        return None
    return DraftFinding(
        draft_finding_id=uuid4(),
        tenant_id=tenant_id,
        investigation_id=investigation_id,
        version=1,
        created_at=datetime.now(UTC),
        produced_by_execution_id=insight.execution_id,
        headline=insight.headline,
        summary=insight.summary,
        claims=tuple(
            Claim(
                claim_id=uuid4(),
                kind=ClaimKind(str(claim["kind"])),
                text=str(claim["text"]),
                position=position,
                # The measurement the agent already validated against the
                # aggregate. Dropping it here would leave `observed` as a
                # label a reader has to take on trust.
                metric=_optional_str(claim.get("metric")),
                value=_optional_str(claim.get("value")),
                period=_optional_str(claim.get("period")),
                # Populated when Evidence Citations exist.
                citation_ids=(),
            )
            for position, claim in enumerate(insight.claims)
        ),
        contradictions=tuple(
            Contradiction(detail=detail) for detail in insight.contradictions
        ),
        root_cause=RootCauseState(insight.root_cause),
        confidence=(
            insight.outcome if isinstance(insight.outcome, ConfidenceOutcome) else None
        ),
    )
