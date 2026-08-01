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
    """The graph `_build_graph` produces with `the required Insight role` set.

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
    graph, recorder, _ = build_graph(recheck_passed=True)

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
    ]
    assert outcome.insight is not None


@pytest.mark.asyncio
async def test_insight_does_not_draft_from_a_rejected_attempt() -> None:
    """Three failed rechecks, one Insight execution — at the end, on the
    terminal outcome, not once per attempt."""
    graph, recorder, _ = build_graph(recheck_passed=False)

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
async def test_exactly_one_execution_owns_the_draft_finding() -> None:
    """The point of the contraction. One Orchestrator execution, and it plans;
    one Insight execution, and it draws the conclusion."""
    graph, recorder, _ = build_graph(recheck_passed=True)

    outcome = await graph.run(
        investigation_id=INVESTIGATION_ID,
        tenant_id=TENANT_ID,
        question=QUESTION,
    )

    orchestrations = [r for r in recorder.records if r.role is AgentRole.ORCHESTRATOR]
    drafters = [r for r in recorder.records if r.role is AgentRole.INSIGHT]

    assert len(orchestrations) == 1
    assert len(drafters) == 1
    assert drafters[0].execution_id == outcome.insight.execution_id
    # The Orchestrator's output is a task ledger and nothing else.
    assert set(orchestrations[0].output or {}) == {"tasks"}
    for field in ("headline", "summary", "claims", "contradictions"):
        assert field not in (orchestrations[0].output or {})


@pytest.mark.asyncio
async def test_insight_never_receives_raw_result_rows() -> None:
    """`rows` is the one field that must not travel between agents. Insight is
    downstream of everything, so it is the most likely place to leak."""
    graph, recorder, _ = build_graph(recheck_passed=True)

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
async def test_the_finding_comes_from_the_agent_evaluated_for_writing_it() -> None:
    """There is no Phase 1 path left. The headline a reader sees is the one
    Insight produced under its own evaluation suite, not one an unevaluated
    second Orchestrator call invented."""
    graph, _, _ = build_graph(recheck_passed=True)

    outcome = await graph.run(
        investigation_id=INVESTIGATION_ID,
        tenant_id=TENANT_ID,
        question=QUESTION,
    )

    assert outcome.insight is not None
    assert outcome.headline == outcome.insight.headline
    assert outcome.summary == outcome.insight.summary
    assert outcome.contradictions == outcome.insight.contradictions


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


REVEALING = {
    "headline": "EU refunds rose $240 in July.",
    "summary": "Governed EU refund amount rose from $20 to $260.",
    "claims": [
        {
            "kind": "observed",
            # Both of these must stay out of any error message: the text is
            # customer-derived narrative, the value a customer figure.
            "text": "A pricing change in the Nordics drove refunds to $998.71.",
            "metric": "invented_pricing_driver",
            "value": "998.71",
            "period": "Q3 2026",
        }
    ],
    "contradictions": [],
    "root_cause_resolved": False,
    "confidence": 0.9,
}


class OneShotModel:
    """Serves a single pinned payload, whatever is asked."""

    def __init__(self, payload: object) -> None:
        self._payload = payload

    async def complete(self, **_: object):
        from decimal import Decimal

        from zentra_domain_agent_execution import ExecutionUsage, ModelResponse

        return ModelResponse(
            text=json.dumps(self._payload)
            if isinstance(self._payload, dict)
            else str(self._payload),
            usage=ExecutionUsage(
                input_tokens=1, output_tokens=1, cost_usd=Decimal("0"), model="stub"
            ),
        )


UPSTREAM = {
    "question": QUESTION,
    "analyst": {
        "metrics": [
            {
                "metric": "refund_amount",
                "previous_value": "20.00",
                "current_value": "260.00",
                "unit": "USD",
                "previous_label": "June 2026",
                "current_label": "July 2026",
            }
        ],
        "result_summary": "EU refunds rose from $20 to $260.",
        "evidence_refs": ["artifact://execution/1"],
    },
    "evaluator": {
        "recheck_passed": True,
        "issues": [],
        "outcome": {
            "kind": "confidence",
            "score": 0.8,
            "calibration_method": "evaluator_independent_recheck",
        },
    },
}


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "payload",
    [
        REVEALING,
        {**REVEALING, "root_cause_resolved": True},
        {**REVEALING, "claims": [{**REVEALING["claims"][0], "metric": None}]},
        "not json at all",
    ],
    ids=["invented-metric", "causal-overclaim", "uncited", "malformed"],
)
async def test_a_refusal_never_carries_the_content_it_refused(payload: object) -> None:
    """"Fail closed with sanitized errors" is only worth anything if the error
    itself is safe. These messages reach logs, audit metadata and, through the
    failure path, an API response — so they may name a position and a governed
    metric, and nothing else.
    """
    agent = InsightAgent(model=OneShotModel(payload))

    with pytest.raises(Exception) as raised:  # noqa: PT011 - four distinct types
        await agent.invoke(
            AgentInput(
                investigation_id=INVESTIGATION_ID,
                tenant_id=TENANT_ID,
                state=UPSTREAM,
            )
        )

    message = str(raised.value)
    assert "998.71" not in message, "a customer figure reached the error"
    assert "Nordics" not in message, "claim narrative reached the error"
    assert "pricing change" not in message.lower()
    # An unrecognised metric name is model output too — it can carry prose.
    assert "invented_pricing_driver" not in message


@pytest.mark.asyncio
async def test_no_audit_event_carries_evidence_content() -> None:
    """The third surface the contract names, and the one that is immutable.
    An Audit Entry with a customer figure in it could never be corrected.
    """
    recorder = RecordingRecorder()
    graph = phase_2_graph(recorder=recorder)

    await graph.run(
        investigation_id=INVESTIGATION_ID,
        tenant_id=TENANT_ID,
        question=QUESTION,
    )

    # What `PostgresExecutionRecorder` turns into metadata-only DomainEvents.
    from zentra_api.pipeline import _audit_event, _started_event

    for start in recorder.starts:
        payload = json.dumps(_started_event(start).metadata).lower()
        assert "260.00" not in payload
        assert "refund" not in payload

    for record in recorder.records:
        metadata = json.dumps(_audit_event(record).metadata).lower()
        # Process metadata only: identity, timings, usage, fallbacks.
        assert "260.00" not in metadata
        assert "claims" not in metadata
        assert "headline" not in metadata
        for prohibited in ("rows", "prompt", "reasoning", "credential", "secret"):
            assert prohibited not in metadata
