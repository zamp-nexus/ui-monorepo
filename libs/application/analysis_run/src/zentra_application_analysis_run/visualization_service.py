from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass
from datetime import datetime
from decimal import Decimal
from typing import Protocol
from uuid import UUID, uuid5

from zentra_domain_analysis_run import (
    AgentEventPayload,
    DomainEvent,
    EvidenceReference,
    ExecutionJob,
    ExecutionJobKind,
    AnalysisRunStatus,
    VisualizationArtifact,
    VisualizationArtifactStatus,
    VisualizationBriefV1,
    VisualizationEventPayload,
    VisualizationUsage,
    WorkFeedEventKind,
)

from .dto import (
    AuthenticatedActor,
    ConflictError,
    AnalysisRunNotFoundError,
)
from .ports import AgentExecutionObserver, AnalysisRunUnitOfWorkFactory

_VISUALIZATION_EVENT_NAMESPACE = UUID("a9fa2e45-4e53-4f8d-89ca-8cb450f6c5b8")


class RenderResult(Protocol):
    c1_response: str
    model: str
    api_version: str
    input_tokens: int
    output_tokens: int
    cost_usd: Decimal
    latency_ms: int


class VisualizationRenderer(Protocol):
    async def render(self, brief: VisualizationBriefV1) -> RenderResult: ...


class ConversationContinuation(Protocol):
    async def append(
        self, actor: AuthenticatedActor, *, thread_id: UUID, content: str
    ) -> object: ...


@dataclass(frozen=True, slots=True)
class VisualizationDetail:
    artifact: VisualizationArtifact
    fallback_brief: VisualizationBriefV1 | None


@dataclass(frozen=True, slots=True)
class VisualizationActionResult:
    kind: str
    citation_id: UUID | None = None
    thread_id: UUID | None = None
    analysis_run_id: UUID | None = None


class VisualizationService:
    def __init__(
        self,
        *,
        unit_of_work_factory: AnalysisRunUnitOfWorkFactory,
        renderer: VisualizationRenderer | None,
        now: Callable[[], datetime],
        new_id: Callable[[], UUID],
        continuation: ConversationContinuation | None = None,
        agent_execution_observer: AgentExecutionObserver | None = None,
    ) -> None:
        self._uow_factory = unit_of_work_factory
        self._renderer = renderer
        self._now = now
        self._new_id = new_id
        self._continuation = continuation
        self._agent_execution_observer = agent_execution_observer

    async def for_analysis_run(
        self, actor: AuthenticatedActor, analysis_run_id: UUID
    ) -> VisualizationDetail:
        async with self._uow(
            actor.organization_id, actor.trace_id, actor.span_id
        ) as uow:
            analysis_run = await uow.analysis_runs.get(
                analysis_run_id, organization_id=actor.organization_id
            )
            if analysis_run is None:
                raise AnalysisRunNotFoundError("Visualization was not found")
            artifact = await uow.visualizations.latest_for_analysis_run(
                analysis_run_id, organization_id=actor.organization_id
            )
            if artifact is None:
                raise AnalysisRunNotFoundError("Visualization was not found")
            brief = await uow.visualizations.brief(
                artifact.brief_id, organization_id=actor.organization_id
            )
        return VisualizationDetail(artifact=artifact, fallback_brief=brief)

    async def get(
        self, actor: AuthenticatedActor, visualization_id: UUID
    ) -> VisualizationDetail:
        async with self._uow(
            actor.organization_id, actor.trace_id, actor.span_id
        ) as uow:
            artifact = await uow.visualizations.get(
                visualization_id, organization_id=actor.organization_id
            )
            if artifact is None:
                raise AnalysisRunNotFoundError("Visualization was not found")
            brief = await uow.visualizations.brief(
                artifact.brief_id, organization_id=actor.organization_id
            )
        return VisualizationDetail(artifact=artifact, fallback_brief=brief)

    async def execute_visualization_job(
        self, *, organization_id: UUID, visualization_id: UUID
    ) -> None:
        if self._renderer is None:
            raise _RendererUnavailable()
        now = self._now()
        async with self._uow(organization_id, UUID(int=0), UUID(int=0)) as uow:
            artifact = await uow.visualizations.get(
                visualization_id, organization_id=organization_id, for_update=True
            )
            if artifact is None or artifact.status in {
                VisualizationArtifactStatus.READY,
                VisualizationArtifactStatus.TOMBSTONED,
            }:
                return
            assert artifact.organization_id == organization_id
            brief = await uow.visualizations.brief(
                artifact.brief_id, organization_id=organization_id
            )
            if brief is None:
                raise _BriefUnavailable()
            artifact = artifact.model_copy(
                update={
                    "status": VisualizationArtifactStatus.GENERATING,
                    "updated_at": now,
                    "failure_category": None,
                }
            )
            await uow.visualizations.save(artifact)
            await self._event(uow, artifact, WorkFeedEventKind.VISUALIZATION_STARTED)
            await self._agent_events(uow, artifact, started=True)
            await uow.commit()

        result = await self._renderer.render(brief)
        now = self._now()
        async with self._uow(organization_id, UUID(int=0), UUID(int=0)) as uow:
            current = await uow.visualizations.get(
                visualization_id, organization_id=organization_id, for_update=True
            )
            if (
                current is None
                or current.status is VisualizationArtifactStatus.TOMBSTONED
            ):
                return
            assert current.organization_id == organization_id
            ready = current.model_copy(
                update={
                    "status": VisualizationArtifactStatus.READY,
                    "model": result.model,
                    "api_version": result.api_version,
                    "c1_response": result.c1_response,
                    "usage": VisualizationUsage(
                        input_tokens=result.input_tokens,
                        output_tokens=result.output_tokens,
                        cost_usd=result.cost_usd,
                        latency_ms=result.latency_ms,
                    ),
                    "updated_at": now,
                    "failure_category": None,
                }
            )
            await uow.visualizations.save(ready)
            self._observe_agent_execution(ready, status="success", error_category=None)
            await self._event(uow, ready, WorkFeedEventKind.VISUALIZATION_COMPLETED)
            await self._agent_events(uow, ready, started=False)
            await uow.commit()

    async def fail_visualization_job(
        self,
        *,
        organization_id: UUID,
        visualization_id: UUID,
        failure_category: str,
    ) -> None:
        async with self._uow(organization_id, UUID(int=0), UUID(int=0)) as uow:
            artifact = await uow.visualizations.get(
                visualization_id, organization_id=organization_id, for_update=True
            )
            if (
                artifact is None
                or artifact.status is VisualizationArtifactStatus.TOMBSTONED
            ):
                return
            assert artifact.organization_id == organization_id
            failed = artifact.model_copy(
                update={
                    "status": VisualizationArtifactStatus.FAILED,
                    "failure_category": failure_category,
                    "updated_at": self._now(),
                    "c1_response": None,
                }
            )
            await uow.visualizations.save(failed)
            self._observe_agent_execution(
                failed, status="failure", error_category=failure_category
            )
            await self._event(uow, failed, WorkFeedEventKind.VISUALIZATION_FAILED)
            await self._agent_events(uow, failed, started=False)
            await uow.commit()

    async def retry(
        self, actor: AuthenticatedActor, visualization_id: UUID
    ) -> VisualizationDetail:
        now = self._now()
        async with self._uow(
            actor.organization_id, actor.trace_id, actor.span_id
        ) as uow:
            original = await uow.visualizations.get(
                visualization_id, organization_id=actor.organization_id, for_update=True
            )
            if original is None:
                raise AnalysisRunNotFoundError("Visualization was not found")
            if original.status is not VisualizationArtifactStatus.FAILED:
                raise ConflictError("Only a failed Visualization can be retried")
            ordinal = await uow.visualizations.next_retry_ordinal(
                original.brief_id, organization_id=actor.organization_id
            )
            retried = VisualizationArtifact(
                visualization_id=self._new_id(),
                organization_id=original.organization_id,
                analysis_run_id=original.analysis_run_id,
                brief_id=original.brief_id,
                status=VisualizationArtifactStatus.PENDING,
                retry_of_visualization_id=original.visualization_id,
                created_at=now,
                updated_at=now,
            )
            await uow.visualizations.add_retry(retried, retry_ordinal=ordinal)
            await uow.jobs.add_job(
                ExecutionJob.create(
                    job_id=self._new_id(),
                    organization_id=actor.organization_id,
                    analysis_run_id=original.analysis_run_id,
                    visualization_id=retried.visualization_id,
                    job_kind=ExecutionJobKind.VISUALIZATION,
                    max_attempts=2,
                    now=now,
                )
            )
            await self._event(
                uow, retried, WorkFeedEventKind.VISUALIZATION_RETRY_REQUESTED
            )
            brief = await uow.visualizations.brief(
                retried.brief_id, organization_id=actor.organization_id
            )
            await uow.commit()
        return VisualizationDetail(artifact=retried, fallback_brief=brief)

    async def execute_action(
        self,
        actor: AuthenticatedActor,
        *,
        visualization_id: UUID,
        action_id: UUID,
    ) -> VisualizationActionResult:
        now = self._now()
        async with self._uow(
            actor.organization_id, actor.trace_id, actor.span_id
        ) as uow:
            artifact = await uow.visualizations.get(
                visualization_id, organization_id=actor.organization_id
            )
            action = await uow.visualizations.action(
                visualization_id,
                action_id,
                organization_id=actor.organization_id,
                for_update=True,
            )
            if artifact is None or action is None:
                raise AnalysisRunNotFoundError("Visualization action was not found")
            if artifact.status is not VisualizationArtifactStatus.READY:
                raise ConflictError("Visualization action is not available")
            analysis_run = await uow.analysis_runs.get(
                action.analysis_run_id, organization_id=actor.organization_id
            )
            if analysis_run is None:
                raise AnalysisRunNotFoundError("Visualization action was not found")
            if action.expires_at <= now or action.consumed_at is not None:
                raise ConflictError("Visualization action is no longer available")
            if action.kind.value == "open_citation":
                assert action.citation_id is not None
                citation = await uow.citations.resolve(
                    action.analysis_run_id, action.citation_id,
                    organization_id=actor.organization_id
                )
                if citation is None:
                    raise AnalysisRunNotFoundError("Evidence was not found")
                return VisualizationActionResult(
                    kind=action.kind.value,
                    citation_id=action.citation_id,
                    analysis_run_id=action.analysis_run_id,
                )
            if self._continuation is None or action.follow_up_message is None:
                raise ConflictError("Conversation continuation is unavailable")
            if action.single_use:
                action = action.model_copy(update={"consumed_at": now})
                await uow.visualizations.save_action(action)
                await uow.commit()
            thread_id = action.thread_id
            follow_up = action.follow_up_message
        detail = await self._continuation.append(
            actor, thread_id=thread_id, content=follow_up
        )
        return VisualizationActionResult(
            kind=action.kind.value,
            thread_id=thread_id,
            analysis_run_id=detail.analysis_run_id,
        )

    def _observe_agent_execution(
        self,
        artifact: VisualizationArtifact,
        *,
        status: str,
        error_category: str | None,
    ) -> None:
        """Report the Data Visualization Agent's run, never its C1 response."""
        if self._agent_execution_observer is None:
            return
        self._agent_execution_observer(
            role="visualization",
            agent_id="data_visualization_v1",
            model=artifact.model,
            provider="thesys",
            fallback_count=0,
            input_tokens=artifact.usage.input_tokens,
            output_tokens=artifact.usage.output_tokens,
            cost_usd=str(artifact.usage.cost_usd),
            duration_ms=artifact.usage.latency_ms,
            status=status,
            error_category=error_category,
        )

    async def _event(
        self,
        uow: object,
        artifact: VisualizationArtifact,
        kind: WorkFeedEventKind,
    ) -> None:
        event_id = uuid5(
            _VISUALIZATION_EVENT_NAMESPACE,
            f"{artifact.visualization_id}:{kind.value}",
        )
        await uow.work_feed.append_for_analysis_run(
            organization_id=artifact.organization_id,
            analysis_run_id=artifact.analysis_run_id,
            kind=kind,
            payload=VisualizationEventPayload(
                visualization_id=artifact.visualization_id,
                analysis_run_id=artifact.analysis_run_id,
                status=artifact.status,
                failure_category=artifact.failure_category,
            ),
            occurred_at=self._now(),
            event_id=event_id,
        )
        await uow.outbox.enqueue(
            [
                DomainEvent(
                    event_id=event_id,
                    event_type=kind.value,
                    analysis_run_id=artifact.analysis_run_id,
                    organization_id=artifact.organization_id,
                    status=(
                        AnalysisRunStatus.FAILED
                        if artifact.status is VisualizationArtifactStatus.FAILED
                        else AnalysisRunStatus.COMPLETED
                        if artifact.status
                        in {
                            VisualizationArtifactStatus.READY,
                            VisualizationArtifactStatus.TOMBSTONED,
                        }
                        else AnalysisRunStatus.RUNNING
                    ),
                    occurred_at=self._now(),
                    artifact_refs=(
                        EvidenceReference(
                            f"artifact://visualization/{artifact.visualization_id}"
                        ),
                    ),
                    metadata={
                        "renderer_kind": artifact.renderer_kind,
                        "model": artifact.model,
                        "api_version": artifact.api_version,
                        "input_tokens": artifact.usage.input_tokens,
                        "output_tokens": artifact.usage.output_tokens,
                        "total_cost_usd": str(artifact.usage.cost_usd),
                        "latency_ms": artifact.usage.latency_ms,
                        "failure_category": artifact.failure_category,
                    },
                )
            ]
        )

    async def _agent_events(
        self, uow: object, artifact: VisualizationArtifact, *, started: bool
    ) -> None:
        kinds = (
            (
                WorkFeedEventKind.AGENT_STARTED,
                WorkFeedEventKind.AGENT_CAPABILITY_USED,
                WorkFeedEventKind.AGENT_PUBLIC_UPDATE,
            )
            if started
            else (WorkFeedEventKind.AGENT_COMPLETED,)
        )
        for kind in kinds:
            await uow.work_feed.append_for_analysis_run(
                organization_id=artifact.organization_id,
                analysis_run_id=artifact.analysis_run_id,
                kind=kind,
                payload=AgentEventPayload(
                    execution_id=artifact.visualization_id,
                    agent_id="data_visualization_v1",
                    role="visualization",
                    capability_id=(
                        "render_published_finding"
                        if kind is WorkFeedEventKind.AGENT_CAPABILITY_USED
                        else None
                    ),
                    summary=(
                        "Presentation rendering started."
                        if started
                        else "Presentation rendering attempt completed."
                    ),
                    provider="thesys" if not started else None,
                    model=artifact.model,
                    latency_ms=artifact.usage.latency_ms if not started else None,
                    input_tokens=artifact.usage.input_tokens,
                    output_tokens=artifact.usage.output_tokens,
                    cost_usd=artifact.usage.cost_usd,
                ),
                occurred_at=self._now(),
                event_id=uuid5(
                    _VISUALIZATION_EVENT_NAMESPACE,
                    f"{artifact.visualization_id}:{kind.value}",
                ),
            )

    def _uow(self, organization_id: UUID, trace_id: UUID, span_id: UUID):
        return self._uow_factory(organization_id, trace_id, span_id)


class _RendererUnavailable(RuntimeError):
    category = "renderer_unavailable"
    transient = False


class _BriefUnavailable(RuntimeError):
    category = "brief_unavailable"
    transient = False
