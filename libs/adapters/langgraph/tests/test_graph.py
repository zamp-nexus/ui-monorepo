from __future__ import annotations

import json
from collections.abc import Sequence
from datetime import UTC, datetime, timedelta
from decimal import Decimal
from typing import Any
from uuid import UUID

import pytest
from zentra_domain_agent_execution import (
    AgentExecutionRecord,
    AgentExecutionStart,
    AgentRole,
    ConfidenceOutcome,
    ExecutionUsage,
    ModelMessage,
    ModelResponse,
    RegisteredAgent,
    SemanticCatalog,
    SemanticDimension,
    SemanticMeasure,
    SemanticQuery,
    SemanticResult,
)

from zentra_adapter_langgraph import (
    EvaluatorAgent,
    InsightAgent,
    InvestigationGraph,
    NoEnabledAgentError,
    OrchestratorAgent,
    SqlAnalystAgent,
)
from zentra_adapter_langgraph.agents.orchestrator import REQUIRED_ROLES
from zentra_adapter_langgraph.constants import MAX_EVALUATION_ATTEMPTS
from zentra_adapter_langgraph.schemas import (
    ANALYSIS_SCHEMA,
    DRAFT_FINDING_SCHEMA,
    QUERY_PLAN_SCHEMA,
    RECHECK_SCHEMA,
    SYNTHESIS_SCHEMA,
    TASK_LEDGER_SCHEMA,
)

INVESTIGATION_ID = UUID("11000000-0000-0000-0000-000000000001")
TENANT_ID = UUID("22000000-0000-0000-0000-000000000002")
QUESTION = "Why did EU refunds increase from June to July 2026?"

CATALOG = SemanticCatalog(
    measures=(
        SemanticMeasure(name="Commerce.refundAmount", type="sum"),
        SemanticMeasure(name="Commerce.orderCount", type="countDistinct"),
    ),
    dimensions=(
        SemanticDimension(name="Commerce.orderedAt", type="time"),
        SemanticDimension(name="Commerce.region", type="string"),
    ),
)

QUERY_PLAN = {
    "reasoning": "Compare governed EU refund amount month over month.",
    "query": {
        "measures": ["Commerce.refundAmount"],
        "dimensions": [],
        "time_dimensions": [
            {
                "dimension": "Commerce.orderedAt",
                "granularity": "month",
                "date_range": ["2026-06-01", "2026-07-31"],
            }
        ],
        "filters": [],
    },
}

METRICS = [
    {
        "metric": "refund_amount",
        "previous_value": "20.00",
        "current_value": "260.00",
        "unit": "USD",
    }
]


class StubSemanticLayer:
    def __init__(self) -> None:
        self.queries: list[SemanticQuery] = []

    async def catalog(self) -> SemanticCatalog:
        return CATALOG

    async def query(self, request: SemanticQuery) -> SemanticResult:
        CATALOG.reject_ungoverned(request)
        self.queries.append(request)
        return SemanticResult(
            query=request,
            rows=({"Commerce.refundAmount": "260.00"},),
        )


class StubRegistry:
    def __init__(self, roles: Sequence[AgentRole]) -> None:
        self._roles = roles

    async def enabled_agents(self) -> tuple[RegisteredAgent, ...]:
        return tuple(
            RegisteredAgent(agent_id=f"{role.value}_v1", role=role, version="1")
            for role in self._roles
        )


# What the router resolves each role to, mirrored here so the graph tests keep
# asserting on real model identities rather than on role keys.
ROLE_MODELS = {
    "orchestrator": "gemini/gemini-3-flash",
    "sql_analyst": "cerebras/zai-glm-4.7",
    "evaluator": "groq/openai/gpt-oss-120b",
    # Deliberately distinct from every other role, so a test asserting Insight's
    # attribution cannot pass by picking up another agent's model.
    "insight": "nvidia/nemotron-3-ultra-550b-a55b",
}


class ScriptedModel:
    """Answers by declared schema, so the graph's control flow is what is
    under test rather than any particular model wording."""

    def __init__(
        self,
        *,
        recheck_passed: bool,
        fallbacks: tuple[str, ...] = (),
    ) -> None:
        self._recheck_passed = recheck_passed
        self._fallbacks = fallbacks
        self.calls = 0

    async def complete(
        self,
        *,
        model: str,
        system: str,
        messages: Sequence[ModelMessage],
        max_tokens: int,
        response_schema: dict[str, Any] | None = None,
    ) -> ModelResponse:
        self.calls += 1
        payload = self._payload(response_schema)
        return ModelResponse(
            text=json.dumps(payload),
            usage=ExecutionUsage(
                input_tokens=100,
                output_tokens=20,
                cost_usd=Decimal("0.001"),
                model=ROLE_MODELS[model],
            ),
            fallbacks=self._fallbacks,
        )

    def _payload(self, schema: dict[str, Any] | None) -> dict[str, Any]:
        if schema == TASK_LEDGER_SCHEMA:
            return {
                "tasks": [
                    {"role": "sql_analyst", "objective": "Quantify the movement."},
                    {"role": "evaluator", "objective": "Recheck the movement."},
                ]
            }
        if schema == QUERY_PLAN_SCHEMA:
            return QUERY_PLAN
        if schema == ANALYSIS_SCHEMA:
            return {
                "result_summary": "EU refunds rose from $20 to $260.",
                "metrics": METRICS,
                "confidence": 0.88,
                # Underlying records, not returned rows: two monthly totals
                # over 240 orders.
                "sample_size": 240,
            }
        if schema == RECHECK_SCHEMA:
            return {
                "recheck_passed": self._recheck_passed,
                "discrepancy_pct": 0.0 if self._recheck_passed else 0.42,
                "confidence": 0.86 if self._recheck_passed else 0.2,
                "sample_size": 240,
                "issues": [] if self._recheck_passed else ["Figures disagree."],
            }
        if schema == DRAFT_FINDING_SCHEMA:
            return {
                "headline": "EU refunds rose $240 in July.",
                "summary": "Governed EU refund amount rose from $20 to $260.",
                "claims": [
                    {
                        "kind": "observed",
                        "text": "EU refund amount rose to $260.00.",
                        "metric": "refund_amount",
                        "value": "260.00",
                    }
                ],
                "contradictions": [],
                "root_cause_resolved": False,
                "confidence": 0.9,
            }
        if schema == SYNTHESIS_SCHEMA:
            return {
                "headline": "EU refunds rose $240 in July.",
                "summary": "Governed EU refund amount rose from $20 to $260.",
                "contradictions": [] if self._recheck_passed else ["Recheck failed."],
            }
        raise AssertionError(f"Unscripted schema: {schema}")


def _keys(value: Any) -> set[str]:
    """Every key at every depth."""
    found: set[str] = set()
    if isinstance(value, dict):
        for key, child in value.items():
            found.add(str(key))
            found |= _keys(child)
    elif isinstance(value, list):
        for child in value:
            found |= _keys(child)
    return found


class RecordingRecorder:
    def __init__(self) -> None:
        self.records: list[AgentExecutionRecord] = []
        self.starts: list[AgentExecutionStart] = []

    async def record_started(self, start: AgentExecutionStart) -> None:
        self.starts.append(start)

    async def record(self, execution: AgentExecutionRecord) -> None:
        self.records.append(execution)


def build_graph(
    *,
    recheck_passed: bool,
    roles: Sequence[AgentRole] | None = None,
    fallbacks: tuple[str, ...] = (),
    with_insight: bool = False,
) -> tuple[InvestigationGraph, RecordingRecorder, StubSemanticLayer]:
    model = ScriptedModel(recheck_passed=recheck_passed, fallbacks=fallbacks)
    if roles is None:
        roles = (
            (*REQUIRED_ROLES, AgentRole.INSIGHT) if with_insight else REQUIRED_ROLES
        )
    layer = StubSemanticLayer()
    recorder = RecordingRecorder()
    clock = iter(
        datetime(2026, 7, 29, 8, 0, tzinfo=UTC) + timedelta(seconds=n)
        for n in range(1000)
    )
    graph = InvestigationGraph(
        orchestrator=OrchestratorAgent(
            model=model,
            registry=StubRegistry(roles),
            # Mirrors what `_build_graph` does: turning Insight on makes it a
            # required role. Without this the Phase 2 tests would run a
            # configuration production never produces.
            required_roles=(
                (*REQUIRED_ROLES, AgentRole.INSIGHT)
                if with_insight
                else REQUIRED_ROLES
            ),
        ),
        sql_analyst=SqlAnalystAgent(model=model, semantic_layer=layer),
        evaluator=EvaluatorAgent(model=model, semantic_layer=layer),
        insight=InsightAgent(model=model) if with_insight else None,
        recorder=recorder,
        now=lambda: next(clock),
    )
    return graph, recorder, layer


@pytest.mark.asyncio
async def test_converged_run_produces_a_confidence_capped_by_the_recheck() -> None:
    graph, recorder, _ = build_graph(recheck_passed=True)

    outcome = await graph.run(
        investigation_id=INVESTIGATION_ID,
        tenant_id=TENANT_ID,
        question=QUESTION,
    )

    assert outcome.converged is True
    assert outcome.attempts == 1
    assert isinstance(outcome.outcome, ConfidenceOutcome)
    # 0.86 recheck, capped at the analyst's own 0.88 — the cap does not bite here.
    assert outcome.outcome.score == pytest.approx(0.86)
    assert outcome.metrics == METRICS
    assert outcome.contradictions == ()
    # plan, analyze, evaluate, synthesize
    assert [record.role for record in recorder.records] == [
        AgentRole.ORCHESTRATOR,
        AgentRole.SQL_ANALYST,
        AgentRole.EVALUATOR,
        AgentRole.ORCHESTRATOR,
    ]


@pytest.mark.asyncio
async def test_failing_recheck_exits_at_exactly_three_attempts() -> None:
    graph, recorder, _ = build_graph(recheck_passed=False)

    outcome = await graph.run(
        investigation_id=INVESTIGATION_ID,
        tenant_id=TENANT_ID,
        question=QUESTION,
    )

    assert outcome.attempts == MAX_EVALUATION_ATTEMPTS
    assert outcome.converged is False
    assert outcome.contradictions == ("Recheck failed.",)
    assert isinstance(outcome.outcome, ConfidenceOutcome)
    assert outcome.outcome.score < 0.5
    evaluations = [
        record for record in recorder.records if record.role is AgentRole.EVALUATOR
    ]
    assert len(evaluations) == MAX_EVALUATION_ATTEMPTS


@pytest.mark.asyncio
async def test_evidence_pointers_reference_the_recorded_executions() -> None:
    graph, recorder, _ = build_graph(recheck_passed=True)

    outcome = await graph.run(
        investigation_id=INVESTIGATION_ID,
        tenant_id=TENANT_ID,
        question=QUESTION,
    )

    recorded = {f"artifact://execution/{r.execution_id}" for r in recorder.records}
    assert set(outcome.evidence_refs) <= recorded
    assert len(outcome.evidence_refs) == 2


@pytest.mark.asyncio
async def test_result_rows_never_leave_the_execution_record() -> None:
    graph, recorder, _ = build_graph(recheck_passed=True)

    await graph.run(
        investigation_id=INVESTIGATION_ID,
        tenant_id=TENANT_ID,
        question=QUESTION,
    )

    analyst = next(r for r in recorder.records if r.role is AgentRole.SQL_ANALYST)
    assert analyst.output is not None
    assert analyst.output["rows"] == [{"Commerce.refundAmount": "260.00"}]
    # The synthesising Orchestrator is handed the state object; rows are absent.
    synthesis = recorder.records[-1]
    assert "rows" not in json.dumps(synthesis.input)


@pytest.mark.asyncio
async def test_missing_required_role_refuses_rather_than_proceeding() -> None:

    graph, recorder, _ = build_graph(
        recheck_passed=True,
        roles=(AgentRole.SQL_ANALYST,),
    )

    with pytest.raises(NoEnabledAgentError, match="evaluator"):
        await graph.run(
            investigation_id=INVESTIGATION_ID,
            tenant_id=TENANT_ID,
            question=QUESTION,
        )

    # The failed step is still recorded, so the refusal is replayable.
    assert len(recorder.records) == 1
    assert recorder.records[0].status == "failure"


@pytest.mark.asyncio
async def test_executions_carry_token_and_cost_attribution() -> None:
    graph, recorder, _ = build_graph(recheck_passed=True)

    await graph.run(
        investigation_id=INVESTIGATION_ID,
        tenant_id=TENANT_ID,
        question=QUESTION,
    )

    analyst = next(r for r in recorder.records if r.role is AgentRole.SQL_ANALYST)
    assert analyst.usage.input_tokens == 200
    assert analyst.usage.output_tokens == 40
    assert analyst.usage.cost_usd > 0
    assert analyst.usage.model == "cerebras/zai-glm-4.7"
    evaluator = next(r for r in recorder.records if r.role is AgentRole.EVALUATOR)
    # Evaluator deliberately runs a different model family from the analyst, so
    # the recheck cannot inherit the same blind spots.
    assert evaluator.usage.model != analyst.usage.model


@pytest.mark.asyncio
async def test_every_execution_record_carries_the_rungs_that_failed() -> None:
    """Without this the ledger shows only the provider that answered, and the
    live run's three-deep fall-through had to be reconstructed by hand."""
    graph, recorder, _ = build_graph(
        recheck_passed=True,
        fallbacks=("cerebras:zai-glm-4.7: returned 402",),
    )

    await graph.run(
        investigation_id=INVESTIGATION_ID,
        tenant_id=TENANT_ID,
        question=QUESTION,
    )

    assert recorder.records
    for record in recorder.records:
        assert record.fallbacks == ("cerebras:zai-glm-4.7: returned 402",)
