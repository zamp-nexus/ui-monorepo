"""The controlled Phase 2 route: Insight after the Evaluator.

Split from `test_graph.py` to keep both files under the repository's 600-line
limit. The shared harness lives there and is imported here rather than copied,
so a change to the scripted model cannot make the two files disagree about what
the graph is being fed.
"""

from __future__ import annotations

import json
from decimal import Decimal

import pytest
from zentra_domain_agent_execution import (
    AgentDescriptor,
    AgentInput,
    AgentOutput,
    AgentRole,
)

from zentra_adapter_langgraph import (
    EvaluatorAgent,
    InsightAgent,
    InvestigationGraph,
    NoEnabledAgentError,
    OrchestratorAgent,
    SqlAnalystAgent,
)
from zentra_adapter_langgraph.constants import MAX_EVALUATION_ATTEMPTS

from .test_graph import (
    INVESTIGATION_ID,
    QUESTION,
    ROLE_MODELS,
    TENANT_ID,
    RecordingRecorder,
    ScriptedModel,
    StubRegistry,
    StubSemanticLayer,
    _keys,
    build_graph,
)

PHASE_2_ROLES = (AgentRole.SQL_ANALYST, AgentRole.EVALUATOR, AgentRole.INSIGHT)


class RefusingInsight:
    """An Insight that cannot answer.

    A stub satisfying `AgentPort` rather than a subclass of `InsightAgent`:
    inheriting the real agent only to override its one method binds the test to
    a concrete class it is not testing.
    """

    descriptor = AgentDescriptor(
        agent_id="insight_v1",
        role=AgentRole.INSIGHT,
        tool_permissions=(),
        context_budget_tokens=16000,
        input_schema={"type": "object"},
        output_schema={"type": "object"},
        output_fields=frozenset(),
        eval_suite_ref="evals/insight",
    )

    async def invoke(self, agent_input: AgentInput) -> AgentOutput:
        raise RuntimeError("provider chain exhausted")


def phase_2_graph(
    *,
    recorder: RecordingRecorder,
    insight: object | None = None,
    advertised: tuple[AgentRole, ...] = PHASE_2_ROLES,
) -> InvestigationGraph:
    """The graph `_build_graph` produces with `insight_enabled` set.

    `advertised` is what the registry offers, which is how a promoted Insight
    is told apart from an unpromoted one.
    """
    model = ScriptedModel(recheck_passed=True)
    layer = StubSemanticLayer()
    return InvestigationGraph(
        orchestrator=OrchestratorAgent(
            model=model,
            registry=StubRegistry(advertised),
            required_roles=PHASE_2_ROLES,
        ),
        sql_analyst=SqlAnalystAgent(model=model, semantic_layer=layer),
        evaluator=EvaluatorAgent(model=model, semantic_layer=layer),
        insight=insight if insight is not None else InsightAgent(model=model),
        recorder=recorder,
    )


@pytest.mark.asyncio
async def test_insight_runs_after_the_evaluator_and_only_once() -> None:
    """Order is the whole point. Drafting before the recheck settles would
    conclude from evidence the Evaluator is about to reject."""
    graph, recorder, _ = build_graph(recheck_passed=True, with_insight=True)

    outcome = await graph.run(
        investigation_id=INVESTIGATION_ID,
        tenant_id=TENANT_ID,
        question=QUESTION,
    )

    assert [record.role for record in recorder.records] == [
        AgentRole.ORCHESTRATOR,
        AgentRole.SQL_ANALYST,
        AgentRole.EVALUATOR,
        AgentRole.INSIGHT,
        AgentRole.ORCHESTRATOR,
    ]
    assert outcome.insight is not None


@pytest.mark.asyncio
async def test_insight_does_not_draft_from_a_rejected_attempt() -> None:
    """Three failed rechecks, one Insight execution — at the end, on the
    terminal outcome, not once per attempt."""
    graph, recorder, _ = build_graph(recheck_passed=False, with_insight=True)

    await graph.run(
        investigation_id=INVESTIGATION_ID,
        tenant_id=TENANT_ID,
        question=QUESTION,
    )

    insight_runs = [r for r in recorder.records if r.role is AgentRole.INSIGHT]
    evaluator_runs = [r for r in recorder.records if r.role is AgentRole.EVALUATOR]
    assert len(evaluator_runs) == MAX_EVALUATION_ATTEMPTS
    assert len(insight_runs) == 1
    # And it ran after the last of them.
    assert recorder.records.index(insight_runs[0]) > recorder.records.index(
        evaluator_runs[-1]
    )


@pytest.mark.asyncio
async def test_insight_records_its_own_execution_and_attribution() -> None:
    graph, recorder, _ = build_graph(
        recheck_passed=True,
        with_insight=True,
        fallbacks=("gemini/gemini-3-flash: circuit open",),
    )

    outcome = await graph.run(
        investigation_id=INVESTIGATION_ID,
        tenant_id=TENANT_ID,
        question=QUESTION,
    )

    record = next(r for r in recorder.records if r.role is AgentRole.INSIGHT)
    assert record.agent_id == "insight_v1"
    assert record.usage.model == ROLE_MODELS["insight"]
    assert record.usage.input_tokens == 100
    assert record.usage.cost_usd == Decimal("0.001")
    assert record.latency_ms >= 0
    assert record.fallbacks == ("gemini/gemini-3-flash: circuit open",)
    assert record.status.value == "success"

    # The Draft Finding has to be able to name the execution that produced it,
    # so the id the recorder saw and the id the outcome reports must agree.
    assert outcome.insight is not None
    assert outcome.insight.execution_id == record.execution_id
    assert outcome.insight.model == ROLE_MODELS["insight"]
    assert outcome.insight.fallbacks == ("gemini/gemini-3-flash: circuit open",)


@pytest.mark.asyncio
async def test_the_orchestrator_does_not_make_the_insight_model_call() -> None:
    """Insight is a separate Agent Execution, not a phase of the Orchestrator's.
    Two Orchestrator executions, and neither of them produced the draft."""
    graph, recorder, _ = build_graph(recheck_passed=True, with_insight=True)

    outcome = await graph.run(
        investigation_id=INVESTIGATION_ID,
        tenant_id=TENANT_ID,
        question=QUESTION,
    )

    orchestrations = [r for r in recorder.records if r.role is AgentRole.ORCHESTRATOR]
    assert len(orchestrations) == 2
    for record in orchestrations:
        assert record.execution_id != outcome.insight.execution_id
        assert "claims" not in (record.output or {})


@pytest.mark.asyncio
async def test_insight_never_receives_raw_result_rows() -> None:
    """`rows` is the one field that must not travel between agents. Insight is
    downstream of everything, so it is the most likely place to leak."""
    graph, recorder, _ = build_graph(recheck_passed=True, with_insight=True)

    await graph.run(
        investigation_id=INVESTIGATION_ID,
        tenant_id=TENANT_ID,
        question=QUESTION,
    )

    record = next(r for r in recorder.records if r.role is AgentRole.INSIGHT)

    # A key check, not a substring one: governed measure names like
    # `Commerce.refundAmount` legitimately appear in the query plan, so
    # searching the serialised blob for them would fail on evidence that is
    # meant to be there. What must not appear, at any depth, is `rows`.
    assert _keys(record.input).isdisjoint({"rows"})
    # And the aggregate value the analyst measured is present — Insight needs
    # it to check a claim — while the row it came from is not.
    assert "260.00" in json.dumps(record.input)
    # The pointers that lead to the rows are present, which is what makes the
    # evidence reachable without copying it.
    assert "artifact://execution/" in json.dumps(record.input)


@pytest.mark.asyncio
async def test_the_phase_1_path_runs_no_insight_execution() -> None:
    graph, recorder, _ = build_graph(recheck_passed=True)

    outcome = await graph.run(
        investigation_id=INVESTIGATION_ID,
        tenant_id=TENANT_ID,
        question=QUESTION,
    )

    assert outcome.insight is None
    assert not [r for r in recorder.records if r.role is AgentRole.INSIGHT]


@pytest.mark.asyncio
async def test_a_failing_insight_fails_the_phase_2_run_closed() -> None:
    """Not a degraded finding. A draft that could not be produced must not be
    replaced by one nobody attributed."""

    recorder = RecordingRecorder()
    graph = phase_2_graph(insight=RefusingInsight(), recorder=recorder)

    with pytest.raises(RuntimeError, match="provider chain exhausted"):
        await graph.run(
            investigation_id=INVESTIGATION_ID,
            tenant_id=TENANT_ID,
            question=QUESTION,
        )

    # The failure is recorded before it propagates, so Replay can show it.
    failed = next(r for r in recorder.records if r.role is AgentRole.INSIGHT)
    assert failed.status.value == "failure"
    assert failed.errors == ("RuntimeError: provider chain exhausted",)


@pytest.mark.asyncio
async def test_the_phase_2_route_refuses_when_insight_is_not_promoted() -> None:
    """The fail-closed case, and the reason the flag and the registry are two
    switches rather than one. A deployment that turns Phase 2 on without a
    promoted Insight must refuse every investigation, not silently run Phase 1
    and produce an unattributed narrative."""
    recorder = RecordingRecorder()
    # Registry advertises only the Phase 1 roles: Insight is not promoted.
    graph = phase_2_graph(
        recorder=recorder,
        advertised=(AgentRole.SQL_ANALYST, AgentRole.EVALUATOR),
    )

    with pytest.raises(NoEnabledAgentError, match="insight"):
        await graph.run(
            investigation_id=INVESTIGATION_ID,
            tenant_id=TENANT_ID,
            question=QUESTION,
        )

    # It refused at plan time, so nothing analysed and nothing was drafted.
    assert [r.role for r in recorder.records] == [AgentRole.ORCHESTRATOR]
    assert recorder.records[0].status.value == "failure"


@pytest.mark.asyncio
async def test_a_promoted_insight_satisfies_the_phase_2_requirement() -> None:
    graph = phase_2_graph(recorder=RecordingRecorder())

    outcome = await graph.run(
        investigation_id=INVESTIGATION_ID,
        tenant_id=TENANT_ID,
        question=QUESTION,
    )

    assert outcome.insight is not None
    assert outcome.insight.root_cause == "unresolved"


@pytest.mark.asyncio
async def test_insight_announces_its_start_before_the_model_call() -> None:
    """A step that hangs, or a process killed mid-call, writes no completion.
    Replay showing nothing there would be indistinguishable from the step never
    having been attempted."""
    recorder = RecordingRecorder()
    graph = phase_2_graph(recorder=recorder)

    await graph.run(
        investigation_id=INVESTIGATION_ID,
        tenant_id=TENANT_ID,
        question=QUESTION,
    )

    start = next(s for s in recorder.starts if s.role is AgentRole.INSIGHT)
    completion = next(r for r in recorder.records if r.role is AgentRole.INSIGHT)
    assert start.execution_id == completion.execution_id
    assert start.agent_id == "insight_v1"
    assert start.step == completion.step
    # Every step announces itself, not only Insight.
    assert len(recorder.starts) == len(recorder.records)


@pytest.mark.asyncio
async def test_a_failed_insight_still_announced_its_start() -> None:
    """The case the start event exists for: a completion that says `failure`
    is a luxury. A crash gives you only the start."""
    recorder = RecordingRecorder()
    graph = phase_2_graph(insight=RefusingInsight(), recorder=recorder)

    with pytest.raises(RuntimeError):
        await graph.run(
            investigation_id=INVESTIGATION_ID,
            tenant_id=TENANT_ID,
            question=QUESTION,
        )

    assert any(s.role is AgentRole.INSIGHT for s in recorder.starts)
