"""Board persistence and completion rules for an Analysis Run."""

from __future__ import annotations

from collections.abc import Callable, Sequence
from datetime import datetime
from typing import Protocol
from uuid import UUID

from zentra_application_analysis_run import PipelineResult, bounded_outcome
from zentra_domain_agent_execution import ConfidenceOutcome
from zentra_domain_analysis_run import (
    AnalysisRunBoard,
    BoardConfidence,
    Conflict,
    EvidenceReference,
    Fact,
    KnowledgeGap,
    assess_completion,
)

from .orchestrator_uow import AnalysisRunUnitOfWorkFactory
from .outcomes import ValidatedEvidence
from .pipeline import SYSTEM_SPAN_ID, SYSTEM_TRACE_ID


class Measurement(Protocol):
    analyst_item_id: UUID
    evidence: tuple[ValidatedEvidence, ...]


class BoardCoordinator:
    def __init__(
        self,
        *,
        unit_of_work_factory: AnalysisRunUnitOfWorkFactory,
        now: Callable[[], datetime],
        new_id: Callable[[], UUID],
    ) -> None:
        self._unit_of_work_factory = unit_of_work_factory
        self._now = now
        self._new_id = new_id

    async def finish(
        self,
        board: AnalysisRunBoard,
        result: PipelineResult,
        *,
        evidence_validated: bool,
        budget_exhausted: bool,
    ) -> None:
        outcome = bounded_outcome(result)
        threshold = await self._confidence_threshold(board.organization_id)
        board.set_confidence(
            BoardConfidence(
                score=outcome.score if isinstance(outcome, ConfidenceOutcome) else None,
                threshold=threshold,
            ),
            now=self._now(),
        )
        assessment = assess_completion(
            board,
            evidence_validated=evidence_validated,
            budget_exhausted=budget_exhausted,
        )
        board.set_narrative(assessment.describe(), now=self._now())
        async with self._unit_of_work_factory(
            board.organization_id, SYSTEM_TRACE_ID, SYSTEM_SPAN_ID
        ) as unit_of_work:
            await unit_of_work.analysis_run_boards.save(board)
            await unit_of_work.commit()

    async def merge(self, board: AnalysisRunBoard, measurement: Measurement) -> None:
        for measured in measurement.evidence:
            fact = Fact(
                fact_id=self._new_id(),
                metric=measured.metric,
                value=measured.current_value,
                period=measured.current_period,
                producing_work_item_id=measurement.analyst_item_id,
                evidence_refs=(
                    EvidenceReference(
                        f"artifact://execution/{measured.producing_execution_id}"
                    ),
                ),
            )
            incumbent = board.contradicted_by(fact)
            board.record_fact(fact, now=self._now())
            conflict = (
                None
                if incumbent is None
                else Conflict(
                    conflict_id=self._new_id(),
                    description=(
                        f"{fact.metric} over {fact.period or 'the whole period'} "
                        f"was measured as {incumbent.value} and as {fact.value}"
                    ),
                )
            )
            if conflict is not None:
                board.open_conflict(conflict, now=self._now())
            await self._persist_merge(board, fact, conflict)

    async def document_conflicts(self, board: AnalysisRunBoard) -> None:
        settled = list(board.unresolved_conflicts)
        if not settled:
            return
        for conflict in settled:
            board.resolve_conflict(
                conflict.conflict_id,
                resolution=(
                    "Recorded as an unreconciled disagreement between two "
                    "independent measurements; neither was discarded."
                ),
                now=self._now(),
                documented_only=True,
            )
        async with self._unit_of_work_factory(
            board.organization_id, SYSTEM_TRACE_ID, SYSTEM_SPAN_ID
        ) as unit_of_work:
            for conflict in settled:
                await unit_of_work.analysis_run_boards.settle_conflict(
                    board.organization_id, conflict
                )
            await unit_of_work.commit()

    async def open_board(self, board: AnalysisRunBoard, gap: KnowledgeGap) -> None:
        board.open_gap(gap, now=self._now())
        async with self._unit_of_work_factory(
            board.organization_id, SYSTEM_TRACE_ID, SYSTEM_SPAN_ID
        ) as unit_of_work:
            await unit_of_work.analysis_run_boards.create(board)
            await unit_of_work.analysis_run_boards.open_gap(
                board.board_id, board.organization_id, gap
            )
            await unit_of_work.commit()

    async def open_gaps(
        self, board: AnalysisRunBoard, gaps: Sequence[KnowledgeGap]
    ) -> None:
        async with self._unit_of_work_factory(
            board.organization_id, SYSTEM_TRACE_ID, SYSTEM_SPAN_ID
        ) as unit_of_work:
            for gap in gaps:
                board.open_gap(gap, now=self._now())
                await unit_of_work.analysis_run_boards.open_gap(
                    board.board_id, board.organization_id, gap
                )
            await unit_of_work.commit()

    async def close_board(
        self, board: AnalysisRunBoard, answered: Sequence[str]
    ) -> None:
        closing = {description.strip().casefold() for description in answered}
        settled = [
            gap
            for gap in board.open_gaps
            if gap.description.strip().casefold() in closing
        ]
        if not settled:
            return
        async with self._unit_of_work_factory(
            board.organization_id, SYSTEM_TRACE_ID, SYSTEM_SPAN_ID
        ) as unit_of_work:
            for gap in settled:
                board.resolve_gap(gap.gap_id, now=self._now())
                await unit_of_work.analysis_run_boards.resolve_gap(
                    gap.gap_id, board.organization_id
                )
            await unit_of_work.commit()

    async def _confidence_threshold(self, organization_id: UUID) -> float:
        async with self._unit_of_work_factory(
            organization_id, SYSTEM_TRACE_ID, SYSTEM_SPAN_ID
        ) as unit_of_work:
            return await unit_of_work.policies.confidence_threshold(organization_id)

    async def _persist_merge(
        self, board: AnalysisRunBoard, fact: Fact, conflict: Conflict | None
    ) -> None:
        async with self._unit_of_work_factory(
            board.organization_id, SYSTEM_TRACE_ID, SYSTEM_SPAN_ID
        ) as unit_of_work:
            await unit_of_work.analysis_run_boards.record_fact(
                board.board_id, board.organization_id, fact
            )
            if conflict is not None:
                await unit_of_work.analysis_run_boards.open_conflict(
                    board.board_id, board.organization_id, conflict
                )
            await unit_of_work.commit()
