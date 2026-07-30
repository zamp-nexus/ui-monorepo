"""The graph-to-application adapter.

Everything else mocks the pipeline, so this seam was unguarded: a field renamed
on `PipelineOutcome` still type-checked and still passed every test, and only a
live run found it. These tests cost nothing and close that gap.
"""

from __future__ import annotations

from uuid import UUID

import pytest
from zentra_adapter_langgraph import PipelineOutcome
from zentra_adapter_model_providers import ModelTier
from zentra_domain_agent_execution import ConfidenceOutcome

from zentra_api.pipeline import LangGraphInvestigationPipeline

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
async def test_unknown_models_pass_through_as_unknown() -> None:
    """The application treats None as no claim of independence, so the adapter
    must not invent a value here."""
    result = await run(analyst_model=None, evaluator_model=None)

    assert result.analyst_model is None
    assert result.evaluator_model is None
