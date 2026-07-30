"""The graph-to-application adapter.

Everything else mocks the pipeline, so this seam was unguarded: a field renamed
on `PipelineOutcome` still type-checked and still passed every test, and only a
live run found it. These tests cost nothing and close that gap.
"""

from __future__ import annotations

from datetime import UTC, datetime
from uuid import UUID, uuid4

import pytest
from zentra_adapter_langgraph import PipelineOutcome
from zentra_adapter_model_providers import ModelTier
from zentra_domain_agent_execution import (
    AgentExecutionRecord,
    AgentRole,
    ConfidenceOutcome,
    ExecutionStatus,
    LegacyRoleWriteError,
)

from zentra_api.pipeline import (
    LangGraphInvestigationPipeline,
    PostgresExecutionRecorder,
)

INVESTIGATION_ID = UUID("11000000-0000-0000-0000-000000000001")
TENANT_ID = UUID("22000000-0000-0000-0000-000000000002")


class StubGraph:
    def __init__(self, outcome: PipelineOutcome) -> None:
        self._outcome = outcome

    async def run(self, **_: object) -> PipelineOutcome:
        return self._outcome


def outcome(**overrides: object) -> PipelineOutcome:
    defaults: dict[str, object] = {
        "headline": "EU refunds rose $240 in July.",
        "summary": "Governed EU refund amount rose from $20 to $260.",
        "metrics": [
            {
                "metric": "refund_amount",
                "previous_value": "20.00",
                "current_value": "260.00",
                "unit": "USD",
            }
        ],
        "evidence_refs": ("artifact://execution/abc",),
        "outcome": ConfidenceOutcome(score=0.9, calibration_method="self_reported"),
        "converged": True,
        "contradictions": (),
        "attempts": 1,
        "analyst_model": "gemini/gemini-3.6-flash",
        "evaluator_model": "nvidia/nemotron-3-ultra-550b-a55b",
        "analyst_sample_size": 8,
        "evaluator_sample_size": 8,
    }
    return PipelineOutcome(**(defaults | overrides))  # type: ignore[arg-type]


async def run(**overrides: object):
    graph = StubGraph(outcome(**overrides))
    pipeline = LangGraphInvestigationPipeline({ModelTier.FREE: graph})
    return await pipeline.run(
        investigation_id=INVESTIGATION_ID,
        tenant_id=TENANT_ID,
        question="Why did EU refunds increase?",
    )


@pytest.mark.asyncio
async def test_the_evidence_the_ceilings_need_survives_the_adapter() -> None:
    """Dropped silently, the application would grade every recheck as NONE and
    gate everything — or worse, cap nothing at all."""
    result = await run()

    assert result.analyst_model == "gemini/gemini-3.6-flash"
    assert result.evaluator_model == "nvidia/nemotron-3-ultra-550b-a55b"
    assert result.analyst_sample_size == 8
    assert result.evaluator_sample_size == 8


@pytest.mark.asyncio
async def test_the_finding_and_the_convergence_signal_survive_it_too() -> None:
    result = await run(converged=False, contradictions=("Recheck disagreed.",))

    assert result.finding.headline == "EU refunds rose $240 in July."
    assert result.finding.metrics[0].current_value == "260.00"
    assert result.finding.evidence_refs[0].value == "artifact://execution/abc"
    assert result.converged is False
    assert result.contradictions == ("Recheck disagreed.",)


@pytest.mark.asyncio
async def test_the_periods_a_metric_covers_survive_the_adapter() -> None:
    """Without these the UI has no period to render, and the one it invented
    captioned an October-November finding as June-July."""
    result = await run(
        metrics=[
            {
                "metric": "refund_amount",
                "previous_value": "20.00",
                "previous_label": "June 2026",
                "current_value": "260.00",
                "current_label": "July 2026",
                "unit": "USD",
            }
        ]
    )

    assert result.finding.metrics[0].previous_label == "June 2026"
    assert result.finding.metrics[0].current_label == "July 2026"


@pytest.mark.asyncio
@pytest.mark.parametrize("said_nothing", [None, "", "   "])
async def test_a_metric_that_names_no_period_reports_none(
    said_nothing: str | None,
) -> None:
    """A model may legitimately have no period to name. Stringifying its silence
    would caption the metric with an empty one, which is the bug again."""
    result = await run(
        metrics=[
            {
                "metric": "refund_rate",
                "previous_value": "25",
                "previous_label": said_nothing,
                "current_value": "75",
                "current_label": said_nothing,
                "unit": "percent",
            }
        ]
    )

    assert result.finding.metrics[0].previous_label is None
    assert result.finding.metrics[0].current_label is None


@pytest.mark.asyncio
async def test_a_recording_made_before_labels_existed_still_runs() -> None:
    """Cassettes predate the field. Requiring it would turn every old recording
    into a crash."""
    result = await run()

    assert result.finding.metrics[0].previous_label is None


@pytest.mark.asyncio
async def test_unknown_models_pass_through_as_unknown() -> None:
    """The application treats None as no claim of independence, so the adapter
    must not invent a value here."""
    result = await run(analyst_model=None, evaluator_model=None)

    assert result.analyst_model is None
    assert result.evaluator_model is None


def execution(role: AgentRole) -> AgentExecutionRecord:
    moment = datetime(2026, 7, 30, 9, 0, tzinfo=UTC)
    return AgentExecutionRecord(
        execution_id=uuid4(),
        investigation_id=INVESTIGATION_ID,
        tenant_id=TENANT_ID,
        agent_id="insight_v1",
        role=role,
        step=3,
        input={"question": "Why did EU refunds increase?"},
        status=ExecutionStatus.SUCCESS,
        latency_ms=1200,
        started_at=moment,
        completed_at=moment,
    )


class ExplodingUnitOfWorkFactory:
    """Any use at all is a failure: the guard must refuse before the
    transaction opens, not after a partial write."""

    def __call__(self, *_: object) -> object:
        raise AssertionError("A legacy role reached the transaction")


@pytest.mark.asyncio
async def test_the_recorder_refuses_to_write_the_legacy_insight_role() -> None:
    """The role travels into the audit ledger's metadata, and Audit Entries are
    immutable — a legacy value written there could never be corrected."""
    recorder = PostgresExecutionRecorder(ExplodingUnitOfWorkFactory())  # type: ignore[arg-type]

    with pytest.raises(LegacyRoleWriteError, match="insight_root_cause"):
        await recorder.record(execution(AgentRole.INSIGHT_ROOT_CAUSE))


def test_the_audit_event_carries_the_canonical_role() -> None:
    from zentra_api.pipeline import _audit_event

    event = _audit_event(execution(AgentRole.INSIGHT))

    assert event.metadata["role"] == "insight"
