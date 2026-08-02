"""The Insight Agent's refusals, and what its error messages may carry.

Already a standalone test when it lived in `test_graph_insight.py` — it built
the agent directly and never touched the graph — so ADR-0023's deletion moved
the file it sat in, not the test. Insight's behaviour inside the loop is
covered by `apps/api/tests/test_loop_insight.py`.
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
)

from zentra_adapter_langgraph import InsightAgent

INVESTIGATION_ID = UUID("11000000-0000-0000-0000-000000000001")
TENANT_ID = UUID("22000000-0000-0000-0000-000000000002")
QUESTION = "Why did EU refunds increase from June to July 2026?"

REVEALING = {
    "headline": "EU refunds rose $240 in July.",
    "summary": "Governed EU refund amount rose from $20 to $260.",
    "claims": [
        {
            "kind": "observed",
            # Both of these must stay out of any error message: the text is
            # customer-derived narrative, the value a customer figure.
            "text": "A pricing change in the Nordics drove refunds to $998.71.",
            "metric": "invented_pricing_driver",
            "value": "998.71",
            "period": "Q3 2026",
        }
    ],
    "contradictions": [],
    "root_cause_resolved": False,
    "confidence": 0.9,
}


class OneShotModel:
    """Serves a single pinned payload, whatever is asked."""

    def __init__(self, payload: object) -> None:
        self._payload = payload

    async def complete(self, **_: object) -> ModelResponse:
        return ModelResponse(
            text=json.dumps(self._payload)
            if isinstance(self._payload, dict)
            else str(self._payload),
            usage=ExecutionUsage(
                input_tokens=1, output_tokens=1, cost_usd=Decimal("0"), model="stub"
            ),
        )


UPSTREAM = {
    "question": QUESTION,
    "analyst": {
        "metrics": [
            {
                "metric": "refund_amount",
                "previous_value": "20.00",
                "current_value": "260.00",
                "unit": "USD",
                "previous_label": "June 2026",
                "current_label": "July 2026",
            }
        ],
        "result_summary": "EU refunds rose from $20 to $260.",
        "evidence_refs": ["artifact://execution/1"],
    },
    "evaluator": {
        "recheck_passed": True,
        "issues": [],
        "outcome": {
            "kind": "confidence",
            "score": 0.8,
            "calibration_method": "evaluator_independent_recheck",
        },
    },
}


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "payload",
    [
        REVEALING,
        {**REVEALING, "root_cause_resolved": True},
        {**REVEALING, "claims": [{**REVEALING["claims"][0], "metric": None}]},
        "not json at all",
    ],
    ids=["invented-metric", "causal-overclaim", "uncited", "malformed"],
)
async def test_a_refusal_never_carries_the_content_it_refused(payload: object) -> None:
    """ "Fail closed with sanitized errors" is only worth anything if the error
    itself is safe. These messages reach logs, audit metadata and, through the
    failure path, an API response — so they may name a position and a governed
    metric, and nothing else.
    """
    agent = InsightAgent(model=OneShotModel(payload))

    with pytest.raises(Exception) as raised:  # noqa: PT011 - four distinct types
        await agent.invoke(
            AgentInput(
                investigation_id=INVESTIGATION_ID,
                tenant_id=TENANT_ID,
                state=UPSTREAM,
            )
        )

    message = str(raised.value)
    assert "998.71" not in message, "a customer figure reached the error"
    assert "Nordics" not in message, "claim narrative reached the error"
    assert "pricing change" not in message.lower()
    # An unrecognised metric name is model output too — it can carry prose.
    assert "invented_pricing_driver" not in message
