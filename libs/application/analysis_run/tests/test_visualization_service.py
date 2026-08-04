"""No test in this package constructed `VisualizationService` at any
granularity before this file — it was only ever exercised indirectly. These
tests cover the one thing this plan adds: that a render's success or failure
reaches an injected `AgentExecutionObserver`, and that an unconfigured
observer is a silent no-op, mirroring `AnalysisRunService`'s existing
`_observe_publication`/`_observe_erasure` no-op-when-unset behaviour.
"""

from __future__ import annotations

from contextlib import AbstractAsyncContextManager
from dataclasses import dataclass
from datetime import UTC, datetime
from decimal import Decimal
from uuid import UUID

import pytest
from zentra_domain_analysis_run import (
    VisualizationArtifact,
    VisualizationArtifactStatus,
    VisualizationBriefV1,
)

from zentra_application_analysis_run import VisualizationService

NOW = datetime(2026, 8, 3, tzinfo=UTC)
TENANT_ID = UUID("40000000-0000-0000-0000-000000000004")
ANALYSIS_RUN_ID = UUID("50000000-0000-0000-0000-000000000005")
BRIEF_ID = UUID("60000000-0000-0000-0000-000000000006")
VISUALIZATION_ID = UUID("70000000-0000-0000-0000-000000000007")


def brief() -> VisualizationBriefV1:
    return VisualizationBriefV1(
        analysis_run_id=ANALYSIS_RUN_ID,
        question="Why did EU refunds rise?",
        headline="EU refunds rose $240 in July.",
        summary="Governed EU refund amount rose from $20 to $260.",
        outcome_kind="confidence",
        confidence=0.9,
    )


def pending_artifact() -> VisualizationArtifact:
    return VisualizationArtifact(
        visualization_id=VISUALIZATION_ID,
        organization_id=TENANT_ID,
        analysis_run_id=ANALYSIS_RUN_ID,
        brief_id=BRIEF_ID,
        status=VisualizationArtifactStatus.PENDING,
        created_at=NOW,
        updated_at=NOW,
    )


@dataclass(frozen=True, slots=True)
class _RenderResult:
    c1_response: str = "<c1/>"
    model: str = "thesys-c1"
    api_version: str = "2026-01-01"
    input_tokens: int = 120
    output_tokens: int = 340
    cost_usd: Decimal = Decimal("0.0021")
    latency_ms: int = 950


class _Renderer:
    async def render(self, brief: VisualizationBriefV1) -> _RenderResult:
        return _RenderResult()


class _Visualizations:
    def __init__(self, artifact: VisualizationArtifact) -> None:
        self.artifact = artifact
        self.saved: list[VisualizationArtifact] = []

    async def get(
        self, visualization_id: UUID, *, for_update: bool = False
    ) -> VisualizationArtifact | None:
        if visualization_id != self.artifact.visualization_id:
            return None
        return self.artifact

    async def brief(self, brief_id: UUID) -> VisualizationBriefV1 | None:
        return brief()

    async def save(self, artifact: VisualizationArtifact) -> None:
        self.artifact = artifact
        self.saved.append(artifact)


class _WorkFeed:
    async def append_for_analysis_run(self, **kwargs: object) -> None:
        return None


class _Outbox:
    async def enqueue(self, events: object) -> None:
        return None


class _UnitOfWork:
    def __init__(self, artifact: VisualizationArtifact) -> None:
        self.visualizations = _Visualizations(artifact)
        self.work_feed = _WorkFeed()
        self.outbox = _Outbox()

    async def __aenter__(self) -> _UnitOfWork:
        return self

    async def __aexit__(self, *args: object) -> None:
        return None

    async def commit(self) -> None:
        return None


class _Factory:
    def __init__(self, artifact: VisualizationArtifact) -> None:
        self.uow = _UnitOfWork(artifact)

    def __call__(
        self, organization_id: UUID, trace_id: UUID, span_id: UUID
    ) -> AbstractAsyncContextManager[_UnitOfWork]:
        return self.uow


def service(
    *, artifact: VisualizationArtifact, observer=None
) -> tuple[VisualizationService, _Factory]:
    factory = _Factory(artifact)
    return (
        VisualizationService(
            unit_of_work_factory=factory,
            renderer=_Renderer(),
            now=lambda: NOW,
            new_id=lambda: VISUALIZATION_ID,
            agent_execution_observer=observer,
        ),
        factory,
    )


@pytest.mark.asyncio
async def test_a_successful_render_reports_agent_execution_telemetry() -> None:
    observed: list[dict[str, object]] = []
    instance, _ = service(
        artifact=pending_artifact(), observer=lambda **kwargs: observed.append(kwargs)
    )

    await instance.execute_visualization_job(
        organization_id=TENANT_ID, visualization_id=VISUALIZATION_ID
    )

    assert observed == [
        {
            "role": "visualization",
            "agent_id": "data_visualization_v1",
            "model": "thesys-c1",
            "provider": "thesys",
            "fallback_count": 0,
            "input_tokens": 120,
            "output_tokens": 340,
            "cost_usd": "0.0021",
            "duration_ms": 950,
            "status": "success",
            "error_category": None,
        }
    ]


@pytest.mark.asyncio
async def test_a_failed_render_reports_the_failure_category_as_error_category() -> None:
    observed: list[dict[str, object]] = []
    instance, _ = service(
        artifact=pending_artifact(), observer=lambda **kwargs: observed.append(kwargs)
    )

    await instance.fail_visualization_job(
        organization_id=TENANT_ID,
        visualization_id=VISUALIZATION_ID,
        failure_category="renderer_timeout",
    )

    assert observed[-1]["status"] == "failure"
    assert observed[-1]["error_category"] == "renderer_timeout"
    # No content, no tokens the renderer never spent — a failure before any
    # render attempt costs nothing, and telemetry should say so honestly.
    assert observed[-1]["input_tokens"] == 0
    assert observed[-1]["cost_usd"] == "0"


@pytest.mark.asyncio
async def test_no_observer_configured_is_a_silent_no_op() -> None:
    """The observer is optional — a deployment without one must not crash."""
    instance, _ = service(artifact=pending_artifact(), observer=None)

    await instance.execute_visualization_job(
        organization_id=TENANT_ID, visualization_id=VISUALIZATION_ID
    )
