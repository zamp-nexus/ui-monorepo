from __future__ import annotations

from collections.abc import Mapping
from uuid import UUID

from zentra_adapter_langgraph import InvestigationGraph
from zentra_adapter_model_providers import ModelTier
from zentra_adapter_postgres import PostgresInvestigationUnitOfWorkFactory
from zentra_application_investigation import PipelineResult
from zentra_domain_agent_execution import AgentExecutionRecord, ExecutionStatus
from zentra_domain_investigation import (
    DomainEvent,
    EvidenceReference,
    Finding,
    InvestigationStatus,
    MetricComparison,
)

SYSTEM_TRACE_ID = UUID(int=0)
SYSTEM_SPAN_ID = UUID(int=0)


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

    async def record(self, execution: AgentExecutionRecord) -> None:
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
        )
