"""The Intake Agent's disposition handling, including `not_analytical`.

Mirrors `test_insight_agent.py`'s style: builds the agent directly against a
stub model rather than exercising it through the graph.
"""

from __future__ import annotations

import json
from decimal import Decimal
from uuid import UUID

import pytest
from zentra_domain_agent_execution import (
    AgentInput,
    ExecutionUsage,
    ModelResponse,
    SemanticCatalog,
    SemanticQuery,
    SemanticResult,
)

from zentra_adapter_langgraph import IntakeAgent
from zentra_adapter_langgraph.schemas import INTAKE_SCHEMA

ANALYSIS_RUN_ID = UUID("11000000-0000-0000-0000-000000000001")
TENANT_ID = UUID("22000000-0000-0000-0000-000000000002")


class FakeSemanticLayer:
    async def catalog(self) -> SemanticCatalog:
        return SemanticCatalog(measures=(), dimensions=())

    async def query(self, request: SemanticQuery) -> SemanticResult:
        raise NotImplementedError


class OneShotModel:
    """Serves a single pinned payload, whatever is asked."""

    def __init__(self, payload: dict[str, object]) -> None:
        self._payload = payload

    async def complete(self, **_: object) -> ModelResponse:
        return ModelResponse(
            text=json.dumps(self._payload),
            usage=ExecutionUsage(
                input_tokens=1, output_tokens=1, cost_usd=Decimal("0"), model="stub"
            ),
        )


def test_intake_schema_accepts_not_analytical_as_a_disposition() -> None:
    assert "not_analytical" in INTAKE_SCHEMA["properties"]["disposition"]["enum"]


@pytest.mark.asyncio
async def test_not_analytical_disposition_fails_validation_with_its_own_issue() -> (
    None
):
    """`not_analytical` is correctly not-resolved -- it never becomes an
    AnalysisRun -- but the refusal reason must say so rather than the
    generic "needs clarification" message, since nothing was ambiguous.
    """
    agent = IntakeAgent(
        model=OneShotModel(
            {
                "disposition": "not_analytical",
                "normalized_question": None,
                "clarification": None,
                "reasoning": "This is a greeting, not a business question.",
            }
        ),
        semantic_layer=FakeSemanticLayer(),
    )

    output = await agent.invoke(
        AgentInput(
            analysis_run_id=ANALYSIS_RUN_ID,
            organization_id=TENANT_ID,
            state={"question": "hi there"},
        )
    )

    assert output.fields["disposition"] == "not_analytical"
    assert output.outcome.passed is False
    assert output.outcome.issues == ("The message is not a business question.",)
    assert output.reasoning == "This is a greeting, not a business question."
