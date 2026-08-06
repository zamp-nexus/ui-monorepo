"""The Analysis Run Engine's loop: a Board, a Work Item queue, and Agents.

Split out of `pipeline.py`, which crossed the repository's 600-line limit once
Phase 3 gave the loop a planner and parallel children. `pipeline.py` keeps what
surrounds a run — the execution recorder, the audit events, and the assembly
that turns an outcome into a `Finding` and its Citations; this module is the
run itself.

See ADR-0026. The loop is a deterministic service, not an Agent: it may ask a
model for planning *proposals*, but which proposals become Work Items, and when
the analysis run is finished, are decided by rule here.
"""

from __future__ import annotations

import asyncio
from collections.abc import Awaitable, Callable, Mapping
from contextvars import ContextVar
from dataclasses import dataclass
from datetime import UTC, datetime
from itertools import count
from time import perf_counter
from uuid import UUID, uuid4

from zentra_adapter_cube import CubeSemanticLayer
from zentra_adapter_langgraph import (
    CubeAnalystAgent,
    DataDiscoveryPort,
    EvaluatorAgent,
    InsightAgent,
    OrchestratorAgent,
    SkillRegistry,
)
from zentra_adapter_langgraph.constants import MAX_EVALUATION_ATTEMPTS
from zentra_adapter_model_providers import (
    ModelTier,
    ProviderCircuitBreaker,
    ProviderClients,
    RoutedModelClient,
)
from zentra_adapter_telemetry import record_analysis_run
from zentra_application_analysis_run import PipelineResult
from zentra_domain_agent_execution import (
    AgentExecutionRecorder,
    AgentRegistryPort,
    AgentRole,
)
from zentra_domain_analysis_run import AnalysisRunBoard, GapPriority, KnowledgeGap

from .agent_data_discovery import DiscoveryRunMetrics
from .cube_scope import ScopedCubeSemanticLayers
from .orchestrator_board import BoardCoordinator
from .orchestrator_evidence import (
    UnsettledConflictError as _UnsettledConflictError,
)
from .orchestrator_evidence import (
    accept_followups as _accept_followups,
)
from .orchestrator_evidence import (
    documented_conflicts,
    insight_outcome_from_state,
    outcome_signal,
    require_settled_conflicts,
)
from .orchestrator_measurements import MeasurementCoordinator
from .orchestrator_steps import StepRunner
from .orchestrator_uow import AnalysisRunUnitOfWorkFactory
from .outcomes import PipelineOutcome
from .pipeline import (
    CancellationRequested,
    _pipeline_result,
)

# Kept as module imports for the existing direct rule tests while the concrete
# implementations live with the other evidence transformations.
UnsettledConflictError = _UnsettledConflictError
_accept = _accept_followups
_require_settled_conflicts = require_settled_conflicts


async def _no_cancellation(_: UUID, __: UUID) -> None:
    """The default for tests and eval harnesses, which have no job to cancel."""
    return None


#: How many follow-up measurements one Analysis Run may fan out to, and how
#: many run at once — the same number, because accepting more than can run
#: concurrently would only queue them behind each other.
#:
#: A constructor parameter with this default rather than a per-Organization
#: column: there is no budget field on `organizations` to extend, and
#: inventing one before anybody has asked what an Organization's analytical
#: budget *is* would be guessing at a schema. This is the seam that change
#: lands on.
MAX_FANOUT_WORK_ITEMS = 3


@dataclass(slots=True)
class _RunTelemetry:
    tool_call_count: int = 0
    discovery: DataDiscoveryPort | None = None


_RUN_TELEMETRY: ContextVar[_RunTelemetry | None] = ContextVar(
    "analysis_run_telemetry", default=None
)


def _discovery_metrics(discovery: DataDiscoveryPort | None) -> DiscoveryRunMetrics:
    metrics = getattr(discovery, "metrics", None)
    if isinstance(metrics, DiscoveryRunMetrics):
        return metrics
    return DiscoveryRunMetrics(inventory_cache_hits=0, schema_snapshot_reuses=0)


@dataclass(slots=True)
class StepAgents:
    """The Agents one run drives.

    `planner` is optional. It proposes follow-up questions and enforces the
    registry's capability match; a harness that wires none simply runs the
    primary question with no fan-out, which is what the eval replay harness
    and every test that predates Phase 3 want.
    """

    cube_analyst: CubeAnalystAgent
    evaluator: EvaluatorAgent
    insight: InsightAgent
    planner: OrchestratorAgent | None = None
    discovery: DataDiscoveryPort | None = None


AgentsFactory = Callable[[CubeSemanticLayer], "StepAgents"]


def build_agents_factory(
    *,
    tier: ModelTier,
    models: ProviderClients,
    breaker: ProviderCircuitBreaker,
    registry: AgentRegistryPort | None = None,
    discovery_factory: Callable[[], DataDiscoveryPort] | None = None,
) -> AgentsFactory:
    """A per-tier factory, parameterized by the semantic layer.

    The semantic layer is a runtime argument rather than closed over here
    because it must be scoped per (Organization, Data Connection), not per tier —
    see `ScopedCubeSemanticLayers`.

    A `registry` produces a planner. Insight is required in its required
    roles, not optional: nothing else writes a Finding, so a deployment whose
    registry has not promoted one must refuse at plan time rather than reach
    the last Work Item with nothing to run.
    """
    model = RoutedModelClient(tier=tier, clients=models.as_dict(), breaker=breaker)
    # Read from disk once per tier rather than per Agent Execution. Skills are
    # stable per role, and they are appended to the cached system prefix — a
    # registry rebuilt per analysis run would still be correct but would do
    # the file I/O on the request path for no reason.
    skills = SkillRegistry.from_directory()

    def build(semantic_layer: CubeSemanticLayer) -> StepAgents:
        discovery = discovery_factory() if discovery_factory is not None else None
        return StepAgents(
            cube_analyst=CubeAnalystAgent(
                model=model,
                semantic_layer=semantic_layer,
                skills=skills,
                discovery=discovery,
            ),
            evaluator=EvaluatorAgent(
                model=model,
                semantic_layer=semantic_layer,
                skills=skills,
                discovery=discovery,
            ),
            insight=InsightAgent(model=model),
            planner=(
                None
                if registry is None
                else OrchestratorAgent(
                    model=model,
                    registry=registry,
                    required_roles=(
                        AgentRole.CUBE_ANALYST,
                        AgentRole.EVALUATOR,
                        AgentRole.INSIGHT,
                    ),
                )
            ),
            discovery=discovery,
        )

    return build


class OrchestratorLoop:
    """Drives the existing specialist Agents through a durable Analysis Run
    Board and Work Item queue instead of a compiled LangGraph (ADR-0026).

    Phase 3 shape: the primary question is measured and rechecked exactly as
    before, then the planner proposes follow-ups against the Board's open
    gaps, the loop accepts them *by rule*, and the accepted ones run
    concurrently as child Work Items. Their Facts land on the same Board,
    where a measurement disagreeing with one already recorded opens a
    Conflict that must be resolved or documented before Insight may draft.

    What did not change: the ≤`MAX_EVALUATION_ATTEMPTS` Evaluator-Optimizer
    loop, the Agents themselves, and publication authority — which stays
    deterministic Analysis Run policy (ADR-0011), never this loop.
    """

    def __init__(
        self,
        agent_factories: Mapping[ModelTier, AgentsFactory],
        semantic_layers: ScopedCubeSemanticLayers,
        *,
        unit_of_work_factory: AnalysisRunUnitOfWorkFactory,
        recorder: AgentExecutionRecorder,
        now: Callable[[], datetime] = lambda: datetime.now(UTC),
        new_id: Callable[[], UUID] = uuid4,
        cancellation_checkpoint: Callable[[UUID, UUID], Awaitable[None]] = (
            _no_cancellation
        ),
        max_fanout: int = MAX_FANOUT_WORK_ITEMS,
    ) -> None:
        self._agent_factories = dict(agent_factories)
        self._semantic_layers = semantic_layers
        self._unit_of_work_factory = unit_of_work_factory
        self._recorder = recorder
        self._now = now
        self._new_id = new_id
        self._cancellation_checkpoint = cancellation_checkpoint
        self._max_fanout = max_fanout
        self._step_runner = StepRunner(
            unit_of_work_factory=unit_of_work_factory,
            recorder=recorder,
            now=now,
            new_id=new_id,
            cancellation_checkpoint=cancellation_checkpoint,
            record_tool_calls=self._record_tool_calls,
        )
        self._board = BoardCoordinator(
            unit_of_work_factory=unit_of_work_factory, now=now, new_id=new_id
        )
        self._measurements = MeasurementCoordinator(
            step_runner=self._step_runner,
            board=self._board,
            new_id=new_id,
            max_fanout=max_fanout,
        )

    @staticmethod
    def _record_tool_calls(count: int) -> None:
        telemetry = _RUN_TELEMETRY.get()
        if telemetry is not None:
            telemetry.tool_call_count += count

    async def run(
        self,
        *,
        analysis_run_id: UUID,
        organization_id: UUID,
        question: str,
        model_tier: str = ModelTier.FREE.value,
        data_connection_id: UUID | tuple[UUID, ...] | None = None,
    ) -> PipelineResult:
        started = perf_counter()
        telemetry = _RunTelemetry()
        token = _RUN_TELEMETRY.set(telemetry)
        status = "failure"
        try:
            result = await self._run(
                analysis_run_id=analysis_run_id,
                organization_id=organization_id,
                question=question,
                model_tier=model_tier,
                data_connection_id=data_connection_id,
            )
            status = "success"
            return result
        except (asyncio.CancelledError, CancellationRequested):
            status = "cancelled"
            raise
        finally:
            snapshot = _discovery_metrics(telemetry.discovery)
            record_analysis_run(
                status=status,
                duration_ms=int((perf_counter() - started) * 1000),
                tool_call_count=telemetry.tool_call_count,
                inventory_cache_hits=snapshot.inventory_cache_hits,
                schema_snapshot_reuses=snapshot.schema_snapshot_reuses,
            )
            _RUN_TELEMETRY.reset(token)

    async def _run(
        self,
        *,
        analysis_run_id: UUID,
        organization_id: UUID,
        question: str,
        model_tier: str = ModelTier.FREE.value,
        data_connection_id: UUID | tuple[UUID, ...] | None = None,
    ) -> PipelineResult:
        semantic_layer = await self._semantic_layers.resolve(
            organization_id=organization_id, data_connection_id=data_connection_id
        )
        agents = self._agent_factories[ModelTier(model_tier)](semantic_layer)
        telemetry = _RUN_TELEMETRY.get()
        if telemetry is not None:
            telemetry.discovery = getattr(agents, "discovery", None)
        # Held in memory for the length of the run and written through on every
        # change. The rows are what a later run (or an operator) reads; this
        # object is what the loop reasons over, so a decision can never be made
        # from state that failed to persist.
        board = AnalysisRunBoard.create(
            board_id=self._new_id(),
            analysis_run_id=analysis_run_id,
            organization_id=organization_id,
            now=self._now(),
        )
        seed_gap = KnowledgeGap(
            gap_id=self._new_id(), description=question, priority=GapPriority.HIGH
        )
        await self._board.open_board(board, seed_gap)

        # Shared by every concurrent branch, so the ledger orders the whole
        # analysis run rather than each branch privately. `next` on a counter
        # does not await, so no two Work Items can take the same step.
        steps = count(1)

        primary = await self._measurements.measure(
            agents,
            analysis_run_id=analysis_run_id,
            organization_id=organization_id,
            question=question,
            objective=f"Measure what the question asks: {question}",
            steps=steps,
        )
        # Follow-ups spend only after the primary measurement has completed
        # its independent recheck. The planner proposes; policy accepts.
        followups = await self._measurements.plan(
            agents.planner,
            analysis_run_id=analysis_run_id,
            organization_id=organization_id,
            question=question,
            steps=steps,
        )
        await self._board.merge(board, primary)

        children = await self._measurements.fan_out(
            agents,
            board=board,
            analysis_run_id=analysis_run_id,
            organization_id=organization_id,
            followups=followups,
            parent=primary,
            steps=steps,
        )
        for child in children:
            await self._board.merge(board, child)

        # Every Conflict the merges opened is settled here — the loop cannot
        # resolve one without evidence it does not have, so it documents them.
        # `_require_settled_conflicts` then fails closed if any path ever
        # reaches Insight with one still open.
        await self._board.document_conflicts(board)
        require_settled_conflicts(board)

        insight_state, insight_execution_id, _ = await self._step_runner.run(
            agent=agents.insight,
            role=AgentRole.INSIGHT,
            analysis_run_id=analysis_run_id,
            organization_id=organization_id,
            objective="Draft a Finding from the validated evidence",
            payload={
                "question": question,
                "analyst": primary.analyst_state,
                "evaluator": primary.evaluator_state,
            },
            depends_on=(primary.analyst_item_id,),
            steps=steps,
        )
        insight = insight_outcome_from_state(
            {**insight_state, "execution_id": str(insight_execution_id)}
        )

        # The question is answered because Insight drafted from a rechecked
        # measurement; a follow-up is answered only if its own branch survived.
        await self._board.close_board(
            board, [question, *(child.objective for child in children)]
        )

        evidence_refs: list[str] = []
        for measurement in (primary, *children):
            for source in (measurement.analyst_state, measurement.evaluator_state):
                evidence_refs.extend(source.get("evidence_refs", []))

        result = _pipeline_result(
            PipelineOutcome(
                # From the Agent that was evaluated for writing them.
                headline=insight.headline,
                summary=insight.summary,
                metrics=list(primary.analyst_state.get("metrics", [])),
                # Deduplicated, ordered: a fan-out that reached the same
                # execution as the primary must not cite it twice.
                evidence_refs=tuple(dict.fromkeys(evidence_refs)),
                # The Evaluator's recheck is the authoritative confidence: it is
                # already capped at the analyst's own score.
                outcome=outcome_signal(primary.evaluator_state["outcome"]),
                converged=primary.converged,
                # What Insight found, plus what the Board found by cross-checking
                # itself. A follow-up that disagrees with the primary answer is a
                # contradiction the reader is owed, and Insight never saw it.
                contradictions=insight.contradictions + documented_conflicts(board),
                attempts=primary.attempts,
                insight=insight,
                analyst_model=primary.analyst_state.get("model"),
                evaluator_model=primary.evaluator_state.get("model"),
                analyst_sample_size=primary.analyst_state.get("sample_size"),
                evaluator_sample_size=primary.evaluator_state.get("sample_size"),
                evidence=primary.evidence,
            ),
            analysis_run_id=analysis_run_id,
            organization_id=organization_id,
        )

        await self._board.finish(
            board,
            result,
            evidence_validated=primary.converged,
            budget_exhausted=(
                primary.attempts >= MAX_EVALUATION_ATTEMPTS
                or len(children) >= self._max_fanout
            ),
        )
        return result
