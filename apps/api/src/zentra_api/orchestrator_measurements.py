"""Measurement, verification, planning, and bounded fan-out for one run."""

from __future__ import annotations

import asyncio
from collections.abc import Callable, Iterator, Sequence
from dataclasses import dataclass
from typing import Any, Protocol
from uuid import UUID

from zentra_adapter_langgraph import CubeAnalystAgent, EvaluatorAgent, OrchestratorAgent
from zentra_adapter_langgraph.constants import MAX_EVALUATION_ATTEMPTS
from zentra_domain_agent_execution import AgentRole
from zentra_domain_analysis_run import AnalysisRunBoard, GapPriority, KnowledgeGap

from .orchestrator_board import BoardCoordinator
from .orchestrator_evidence import accept_followups, validated_evidence_from_state
from .orchestrator_steps import StepRunner
from .outcomes import ValidatedEvidence


class MeasurementAgents(Protocol):
    cube_analyst: CubeAnalystAgent
    evaluator: EvaluatorAgent
    planner: OrchestratorAgent | None


@dataclass(frozen=True, slots=True)
class MeasurementResult:
    """A governed Analyst measurement with its independent recheck."""

    objective: str
    analyst_state: dict[str, Any]
    evaluator_state: dict[str, Any]
    analyst_item_id: UUID
    attempts: int

    @property
    def converged(self) -> bool:
        return bool(self.evaluator_state.get("recheck_passed"))

    @property
    def evidence(self) -> tuple[ValidatedEvidence, ...]:
        return validated_evidence_from_state(self.analyst_state)


class MeasurementCoordinator:
    """Keeps the accuracy loop identical for primary and follow-up questions."""

    def __init__(
        self,
        *,
        step_runner: StepRunner,
        board: BoardCoordinator,
        new_id: Callable[[], UUID],
        max_fanout: int,
    ) -> None:
        self._step_runner = step_runner
        self._board = board
        self._new_id = new_id
        self._max_fanout = max_fanout

    async def plan(
        self,
        planner: OrchestratorAgent | None,
        *,
        analysis_run_id: UUID,
        organization_id: UUID,
        question: str,
        steps: Iterator[int],
    ) -> tuple[str, ...]:
        if planner is None or self._max_fanout < 1:
            return ()
        state, _, _ = await self._step_runner.run(
            agent=planner,
            role=AgentRole.ORCHESTRATOR,
            analysis_run_id=analysis_run_id,
            organization_id=organization_id,
            objective="Propose the follow-up measurements this question needs",
            payload={"question": question},
            depends_on=(),
            steps=steps,
        )
        proposals = tuple(
            task
            for task in state.get("fields", {}).get("tasks", [])
            if isinstance(task, dict)
        )
        return accept_followups(proposals, question=question, limit=self._max_fanout)

    async def measure(
        self,
        agents: MeasurementAgents,
        *,
        analysis_run_id: UUID,
        organization_id: UUID,
        question: str,
        objective: str,
        steps: Iterator[int],
        parent_work_item_id: UUID | None = None,
        depends_on: tuple[UUID, ...] = (),
    ) -> MeasurementResult:
        analyst_state, analyst_item_id = await self._run_analyst(
            agents.cube_analyst,
            analysis_run_id=analysis_run_id,
            organization_id=organization_id,
            question=question,
            objective=objective,
            steps=steps,
            parent_work_item_id=parent_work_item_id,
            depends_on=depends_on,
            previous_issues=None,
        )
        attempts = 0
        while True:
            evaluator_state, _, _ = await self._step_runner.run(
                agent=agents.evaluator,
                role=AgentRole.EVALUATOR,
                analysis_run_id=analysis_run_id,
                organization_id=organization_id,
                objective="Independently verify the Analyst's measurement",
                payload={"question": question, "analyst": analyst_state},
                depends_on=(analyst_item_id,),
                steps=steps,
                parent_work_item_id=analyst_item_id,
            )
            attempts += 1
            if (
                bool(evaluator_state.get("recheck_passed"))
                or attempts >= MAX_EVALUATION_ATTEMPTS
            ):
                break
            analyst_state, analyst_item_id = await self._run_analyst(
                agents.cube_analyst,
                analysis_run_id=analysis_run_id,
                organization_id=organization_id,
                question=question,
                objective="Re-measure after the Evaluator's recheck disagreed",
                steps=steps,
                parent_work_item_id=parent_work_item_id,
                depends_on=depends_on,
                previous_issues=evaluator_state.get("issues", []),
            )
        return MeasurementResult(
            objective=objective,
            analyst_state=analyst_state,
            evaluator_state=evaluator_state,
            analyst_item_id=analyst_item_id,
            attempts=attempts,
        )

    async def fan_out(
        self,
        agents: MeasurementAgents,
        *,
        board: AnalysisRunBoard,
        analysis_run_id: UUID,
        organization_id: UUID,
        followups: Sequence[str],
        parent: MeasurementResult,
        steps: Iterator[int],
    ) -> tuple[MeasurementResult, ...]:
        accepted = tuple(followups)
        if not accepted:
            return ()
        await self._board.open_gaps(
            board,
            [
                KnowledgeGap(
                    gap_id=self._new_id(),
                    description=objective,
                    priority=GapPriority.MEDIUM,
                )
                for objective in accepted
            ],
        )
        results = await asyncio.gather(
            *(
                self.measure(
                    agents,
                    analysis_run_id=analysis_run_id,
                    organization_id=organization_id,
                    question=objective,
                    objective=objective,
                    steps=steps,
                    parent_work_item_id=parent.analyst_item_id,
                    depends_on=(parent.analyst_item_id,),
                )
                for objective in accepted
            ),
            return_exceptions=True,
        )
        return tuple(
            result for result in results if isinstance(result, MeasurementResult)
        )

    async def _run_analyst(
        self,
        agent: CubeAnalystAgent,
        *,
        analysis_run_id: UUID,
        organization_id: UUID,
        question: str,
        objective: str,
        steps: Iterator[int],
        previous_issues: list[Any] | None,
        parent_work_item_id: UUID | None,
        depends_on: tuple[UUID, ...],
    ) -> tuple[dict[str, Any], UUID]:
        payload: dict[str, Any] = {"question": question}
        if previous_issues is not None:
            payload["previous_issues"] = previous_issues
        state, execution_id, work_item_id = await self._step_runner.run(
            agent=agent,
            role=AgentRole.CUBE_ANALYST,
            analysis_run_id=analysis_run_id,
            organization_id=organization_id,
            objective=objective,
            payload=payload,
            depends_on=depends_on,
            steps=steps,
            parent_work_item_id=parent_work_item_id,
        )
        return {**state, "execution_id": str(execution_id)}, work_item_id
