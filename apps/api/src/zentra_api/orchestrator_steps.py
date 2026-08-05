"""Durable single-agent work-item execution for the orchestration loop."""

from __future__ import annotations

from collections.abc import Awaitable, Callable, Iterator
from datetime import datetime
from typing import Any
from uuid import UUID

from zentra_domain_agent_execution import (
    AgentExecutionRecord,
    AgentExecutionRecorder,
    AgentExecutionStart,
    AgentInput,
    AgentOutput,
    AgentPort,
    AgentRole,
    ExecutionStatus,
    ExecutionUsage,
)
from zentra_domain_analysis_run import EvidenceReference, WorkItem

from .orchestrator_evidence import for_state
from .orchestrator_uow import AnalysisRunUnitOfWorkFactory
from .pipeline import SYSTEM_SPAN_ID, SYSTEM_TRACE_ID


class StepRunner:
    """Persists and invokes exactly one Agent Work Item."""

    def __init__(
        self,
        *,
        unit_of_work_factory: AnalysisRunUnitOfWorkFactory,
        recorder: AgentExecutionRecorder,
        now: Callable[[], datetime],
        new_id: Callable[[], UUID],
        cancellation_checkpoint: Callable[[UUID, UUID], Awaitable[None]],
        record_tool_calls: Callable[[int], None],
    ) -> None:
        self._unit_of_work_factory = unit_of_work_factory
        self._recorder = recorder
        self._now = now
        self._new_id = new_id
        self._cancellation_checkpoint = cancellation_checkpoint
        self._record_tool_calls = record_tool_calls

    async def run(
        self,
        *,
        agent: AgentPort,
        role: AgentRole,
        analysis_run_id: UUID,
        organization_id: UUID,
        objective: str,
        payload: dict[str, Any],
        depends_on: tuple[UUID, ...],
        steps: Iterator[int],
        parent_work_item_id: UUID | None = None,
    ) -> tuple[dict[str, Any], UUID, UUID]:
        await self._cancellation_checkpoint(organization_id, analysis_run_id)
        item = WorkItem.create(
            work_item_id=self._new_id(),
            analysis_run_id=analysis_run_id,
            organization_id=organization_id,
            role=role,
            objective=objective,
            now=self._now(),
            parent_work_item_id=parent_work_item_id,
            depends_on=depends_on,
        )
        async with self._unit_of_work_factory(
            organization_id, SYSTEM_TRACE_ID, SYSTEM_SPAN_ID
        ) as unit_of_work:
            await unit_of_work.work_items.add(item)
            await unit_of_work.commit()

        step = next(steps)
        execution_id = self._new_id()
        started_at = self._now()
        agent_state = {**payload, "execution_id": str(execution_id)}
        await self._recorder.record_started(
            AgentExecutionStart(
                execution_id=execution_id,
                analysis_run_id=analysis_run_id,
                organization_id=organization_id,
                agent_id=agent.descriptor.agent_id,
                role=role,
                step=step,
                started_at=started_at,
            )
        )
        item.start(now=self._now())
        async with self._unit_of_work_factory(
            organization_id, SYSTEM_TRACE_ID, SYSTEM_SPAN_ID
        ) as unit_of_work:
            await unit_of_work.work_items.save(item)
            await unit_of_work.commit()

        try:
            output = await agent.invoke(
                AgentInput(
                    analysis_run_id=analysis_run_id,
                    organization_id=organization_id,
                    state=agent_state,
                )
            )
        except Exception as error:
            completed_at = self._now()
            await self._recorder.record(
                execution_record(
                    execution_id=execution_id,
                    analysis_run_id=analysis_run_id,
                    organization_id=organization_id,
                    agent_id=agent.descriptor.agent_id,
                    role=role,
                    step=step,
                    input_state=agent_state,
                    output=None,
                    status=ExecutionStatus.FAILURE,
                    started_at=started_at,
                    completed_at=completed_at,
                    errors=(f"{type(error).__name__}: {error}",),
                )
            )
            async with self._unit_of_work_factory(
                organization_id, SYSTEM_TRACE_ID, SYSTEM_SPAN_ID
            ) as unit_of_work:
                item.reject(now=completed_at, reason=str(error))
                await unit_of_work.work_items.save(item)
                await unit_of_work.commit()
            raise

        completed_at = self._now()
        self._record_tool_calls(len(output.tool_calls))
        await self._recorder.record(
            execution_record(
                execution_id=execution_id,
                analysis_run_id=analysis_run_id,
                organization_id=organization_id,
                agent_id=agent.descriptor.agent_id,
                role=role,
                step=step,
                input_state=agent_state,
                output=output,
                status=ExecutionStatus.SUCCESS,
                started_at=started_at,
                completed_at=completed_at,
            )
        )
        item.complete(
            now=completed_at,
            artifact_refs=(EvidenceReference(f"artifact://execution/{execution_id}"),),
        )
        async with self._unit_of_work_factory(
            organization_id, SYSTEM_TRACE_ID, SYSTEM_SPAN_ID
        ) as unit_of_work:
            await unit_of_work.work_items.save(item)
            await unit_of_work.commit()
        await self._cancellation_checkpoint(organization_id, analysis_run_id)
        return for_state(output), execution_id, item.work_item_id


def execution_record(
    *,
    execution_id: UUID,
    analysis_run_id: UUID,
    organization_id: UUID,
    agent_id: str,
    role: AgentRole,
    step: int,
    input_state: dict[str, Any],
    output: AgentOutput | None,
    status: ExecutionStatus,
    started_at: datetime,
    completed_at: datetime,
    errors: tuple[str, ...] = (),
) -> AgentExecutionRecord:
    return AgentExecutionRecord(
        execution_id=execution_id,
        analysis_run_id=analysis_run_id,
        organization_id=organization_id,
        agent_id=agent_id,
        role=role,
        step=step,
        input=input_state,
        output=dict(output.fields) if output else None,
        outcome=output.outcome if output else None,
        status=status,
        latency_ms=max(0, int((completed_at - started_at).total_seconds() * 1000)),
        usage=output.usage if output is not None else ExecutionUsage(),
        evidence_refs=output.evidence_refs if output else (),
        fallbacks=output.fallbacks if output else (),
        tool_calls=output.tool_calls if output else (),
        reasoning=output.reasoning if output else None,
        errors=errors,
        started_at=started_at,
        completed_at=completed_at,
    )
