from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Annotated, Any, TypedDict
from uuid import UUID, uuid4

from langgraph.graph import END, START, StateGraph
from zentra_domain_agent_execution import (
    OUTCOME_ADAPTER,
    AgentExecutionRecord,
    AgentExecutionRecorder,
    AgentInput,
    AgentOutput,
    AgentPort,
    ExecutionStatus,
    ExecutionUsage,
    OutcomeSignal,
    model_family,
)

from .agents.evaluator import EvaluatorAgent
from .agents.orchestrator import PLAN, SYNTHESIZE, OrchestratorAgent
from .agents.sql_analyst import SqlAnalystAgent
from .constants import MAX_EVALUATION_ATTEMPTS

# Result rows are the one field that must not travel between agents in the
# state object. They live in agent_executions.output and are reachable only
# through the artifact:// pointer (§3.4 external memory store).
_EXCLUDED_FROM_STATE = frozenset({"rows"})


def _last(_current: Any, incoming: Any) -> Any:
    return incoming


class GraphState(TypedDict, total=False):
    question: Annotated[str, _last]
    investigation_id: Annotated[str, _last]
    tenant_id: Annotated[str, _last]
    step: Annotated[int, _last]
    attempts: Annotated[int, _last]
    tasks: Annotated[list[dict[str, Any]], _last]
    analyst: Annotated[dict[str, Any], _last]
    evaluator: Annotated[dict[str, Any], _last]
    synthesis: Annotated[dict[str, Any], _last]


@dataclass(slots=True)
class PipelineOutcome:
    """What the graph established, for the application to act on."""

    headline: str
    summary: str
    metrics: list[dict[str, Any]]
    evidence_refs: tuple[str, ...]
    outcome: OutcomeSignal
    converged: bool
    contradictions: tuple[str, ...]
    attempts: int
    # False when fallback collapsed the Evaluator onto the Analyst's model
    # family, which makes the recheck something less than independent.
    independent_recheck: bool = True
    analyst_model: str | None = None
    evaluator_model: str | None = None


class InvestigationGraph:
    """Orchestrator -> SQL Analyst -> Evaluator, with the Evaluator-Optimizer
    loop capped at three attempts and a hard exit when it does not converge."""

    def __init__(
        self,
        *,
        orchestrator: OrchestratorAgent,
        sql_analyst: SqlAnalystAgent,
        evaluator: EvaluatorAgent,
        recorder: AgentExecutionRecorder,
        now: Callable[[], datetime] = lambda: datetime.now(UTC),
        new_id: Callable[[], UUID] = uuid4,
        checkpointer: Any | None = None,
    ) -> None:
        self._orchestrator = orchestrator
        self._sql_analyst = sql_analyst
        self._evaluator = evaluator
        self._recorder = recorder
        self._now = now
        self._new_id = new_id
        self._graph = self._build(checkpointer)

    def _build(self, checkpointer: Any | None) -> Any:
        builder: StateGraph = StateGraph(GraphState)
        builder.add_node("plan", self._plan_node)
        builder.add_node("analyze", self._analyze_node)
        builder.add_node("evaluate", self._evaluate_node)
        builder.add_node("synthesize", self._synthesize_node)

        builder.add_edge(START, "plan")
        builder.add_edge("plan", "analyze")
        builder.add_edge("analyze", "evaluate")
        builder.add_conditional_edges(
            "evaluate",
            self._after_evaluate,
            {"retry": "analyze", "synthesize": "synthesize"},
        )
        builder.add_edge("synthesize", END)
        return builder.compile(checkpointer=checkpointer)

    async def run(
        self,
        *,
        investigation_id: UUID,
        tenant_id: UUID,
        question: str,
        thread_id: str | None = None,
    ) -> PipelineOutcome:
        config = {"configurable": {"thread_id": thread_id or str(investigation_id)}}
        final: GraphState = await self._graph.ainvoke(
            {
                "question": question,
                "investigation_id": str(investigation_id),
                "tenant_id": str(tenant_id),
                "step": 0,
                "attempts": 0,
            },
            config=config,
        )
        return self._outcome(final)

    # -- nodes ------------------------------------------------------------

    async def _plan_node(self, state: GraphState) -> GraphState:
        output, step = await self._run_agent(
            self._orchestrator,
            state,
            {"question": state["question"], "phase": PLAN},
        )
        return {"tasks": list(output.fields.get("tasks", [])), "step": step}

    async def _analyze_node(self, state: GraphState) -> GraphState:
        payload: dict[str, Any] = {"question": state["question"]}
        # On a retry the analyst is told what the recheck disagreed with, which
        # is what makes this an optimizer loop rather than a plain repeat.
        if state.get("evaluator"):
            payload["previous_issues"] = state["evaluator"].get("issues", [])
        output, step = await self._run_agent(self._sql_analyst, state, payload)
        return {"analyst": self._for_state(output), "step": step}

    async def _evaluate_node(self, state: GraphState) -> GraphState:
        output, step = await self._run_agent(
            self._evaluator,
            state,
            {"question": state["question"], "analyst": state["analyst"]},
        )
        return {
            "evaluator": self._for_state(output),
            "step": step,
            "attempts": state.get("attempts", 0) + 1,
        }

    async def _synthesize_node(self, state: GraphState) -> GraphState:
        output, step = await self._run_agent(
            self._orchestrator,
            state,
            {
                "question": state["question"],
                "phase": SYNTHESIZE,
                "analyst": state["analyst"],
                "evaluator": state["evaluator"],
            },
        )
        return {"synthesis": self._for_state(output), "step": step}

    def _after_evaluate(self, state: GraphState) -> str:
        passed = bool(state["evaluator"]["fields"].get("recheck_passed"))
        if passed:
            return "synthesize"
        # Hard exit on the counter, never on the score. A non-converging loop
        # escalates with the failure visible rather than spinning (§3.7).
        if state.get("attempts", 0) >= MAX_EVALUATION_ATTEMPTS:
            return "synthesize"
        return "retry"

    # -- helpers ----------------------------------------------------------

    async def _run_agent(
        self,
        agent: AgentPort,
        state: GraphState,
        payload: dict[str, Any],
    ) -> tuple[AgentOutput, int]:
        step = state.get("step", 0) + 1
        execution_id = self._new_id()
        investigation_id = UUID(state["investigation_id"])
        tenant_id = UUID(state["tenant_id"])
        started_at = self._now()
        agent_state = {**payload, "execution_id": str(execution_id)}

        try:
            output = await agent.invoke(
                AgentInput(
                    investigation_id=investigation_id,
                    tenant_id=tenant_id,
                    state=agent_state,
                )
            )
        except Exception as error:
            await self._record(
                agent=agent,
                execution_id=execution_id,
                investigation_id=investigation_id,
                tenant_id=tenant_id,
                step=step,
                agent_state=agent_state,
                output=None,
                status=ExecutionStatus.FAILURE,
                started_at=started_at,
                errors=(f"{type(error).__name__}: {error}",),
            )
            raise

        await self._record(
            agent=agent,
            execution_id=execution_id,
            investigation_id=investigation_id,
            tenant_id=tenant_id,
            step=step,
            agent_state=agent_state,
            output=output,
            status=ExecutionStatus.SUCCESS,
            started_at=started_at,
        )
        return output, step

    async def _record(
        self,
        *,
        agent: AgentPort,
        execution_id: UUID,
        investigation_id: UUID,
        tenant_id: UUID,
        step: int,
        agent_state: dict[str, Any],
        output: AgentOutput | None,
        status: ExecutionStatus,
        started_at: datetime,
        errors: tuple[str, ...] = (),
    ) -> None:
        completed_at = self._now()
        descriptor = agent.descriptor
        await self._recorder.record(
            AgentExecutionRecord(
                execution_id=execution_id,
                investigation_id=investigation_id,
                tenant_id=tenant_id,
                agent_id=descriptor.agent_id,
                role=descriptor.role,
                step=step,
                input=agent_state,
                output=dict(output.fields) if output else None,
                outcome=output.outcome if output else None,
                status=status,
                latency_ms=max(
                    0, int((completed_at - started_at).total_seconds() * 1000)
                ),
                usage=output.usage if output is not None else ExecutionUsage(),
                evidence_refs=output.evidence_refs if output else (),
                errors=errors,
                started_at=started_at,
                completed_at=completed_at,
            )
        )

    @staticmethod
    def _for_state(output: AgentOutput) -> dict[str, Any]:
        return {
            "fields": {
                key: value
                for key, value in output.fields.items()
                if key not in _EXCLUDED_FROM_STATE
            },
            "metrics": output.fields.get("metrics", []),
            "result_summary": output.fields.get("result_summary", ""),
            "issues": output.fields.get("issues", []),
            "recheck_passed": output.fields.get("recheck_passed"),
            "discrepancy_pct": output.fields.get("discrepancy_pct"),
            "outcome": output.outcome.model_dump(mode="json"),
            "evidence_refs": list(output.evidence_refs),
            "model": output.usage.model,
        }

    def _outcome(self, state: GraphState) -> PipelineOutcome:
        analyst = state["analyst"]
        evaluator = state["evaluator"]
        synthesis = state["synthesis"]
        contradictions = tuple(synthesis["fields"].get("contradictions", []))
        converged = bool(evaluator.get("recheck_passed"))

        evidence: list[str] = []
        for source in (analyst, evaluator):
            evidence.extend(source.get("evidence_refs", []))

        analyst_model = analyst.get("model")
        evaluator_model = evaluator.get("model")
        # Compared on what actually ran, not on the routing table: the chain can
        # fall through and land both agents on the same weights.
        independent = model_family(analyst_model) != model_family(evaluator_model)

        return PipelineOutcome(
            headline=str(synthesis["fields"]["headline"]),
            summary=str(synthesis["fields"]["summary"]),
            metrics=list(analyst.get("metrics", [])),
            evidence_refs=tuple(dict.fromkeys(evidence)),
            # The Evaluator's recheck is the authoritative confidence: it is
            # already capped at the analyst's own score.
            outcome=_outcome_signal(evaluator["outcome"]),
            converged=converged,
            contradictions=contradictions,
            attempts=int(state.get("attempts", 0)),
            independent_recheck=independent,
            analyst_model=analyst_model,
            evaluator_model=evaluator_model,
        )


def _outcome_signal(payload: dict[str, Any]) -> OutcomeSignal:
    return OUTCOME_ADAPTER.validate_python(payload)
