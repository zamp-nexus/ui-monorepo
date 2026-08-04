"""The Cube Analyst's own account of its answer.

Builds the agent directly against a stub model, mirroring
`test_intake_agent.py`'s style.
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

from zentra_adapter_langgraph import CubeAnalystAgent

ANALYSIS_RUN_ID = UUID("11000000-0000-0000-0000-000000000001")
TENANT_ID = UUID("22000000-0000-0000-0000-000000000002")
EXECUTION_ID = UUID("33000000-0000-0000-0000-000000000003")


class FakeSemanticLayer:
    async def catalog(self) -> SemanticCatalog:
        return SemanticCatalog(measures=(), dimensions=())

    async def query(self, request: SemanticQuery) -> SemanticResult:
        raise NotImplementedError


class OneShotModel:
    """Serves a single pinned payload, whatever is asked. Cube Analyst always
    holds tools, so a no-tool-call answer still costs a closing turn -- this
    model answers the same way on either turn."""

    def __init__(self, payload: dict[str, object]) -> None:
        self._payload = payload

    async def complete(self, **_: object) -> ModelResponse:
        return ModelResponse(
            text=json.dumps(self._payload),
            usage=ExecutionUsage(
                input_tokens=1, output_tokens=1, cost_usd=Decimal("0"), model="stub"
            ),
        )


@pytest.mark.asyncio
async def test_cube_analyst_surfaces_its_reasoning_on_the_output() -> None:
    """The catalog-only answer never runs a query, so no figures may be
    reported -- which is also the shortest path to a one-turn stub."""
    agent = CubeAnalystAgent(
        model=OneShotModel(
            {
                "result_summary": "No query was needed; the catalog answers this.",
                "metrics": [],
                "sample_size": 0,
                "confidence": 0.7,
            }
        ),
        semantic_layer=FakeSemanticLayer(),
    )

    output = await agent.invoke(
        AgentInput(
            analysis_run_id=ANALYSIS_RUN_ID,
            organization_id=TENANT_ID,
            state={
                "question": "What datasets are there?",
                "execution_id": str(EXECUTION_ID),
            },
        )
    )

    assert output.reasoning == "No query was needed; the catalog answers this."
    assert output.fields["reasoning"] == output.reasoning
