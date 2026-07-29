from __future__ import annotations

import json

from zentra_domain_agent_execution import (
    AgentDescriptor,
    AgentInput,
    AgentOutput,
    AgentRole,
    ConfidenceOutcome,
    ModelMessage,
    ModelPort,
    SemanticLayerPort,
    ToolAccess,
    ToolScope,
    validate_agent_output,
)

from ..constants import DISCREPANCY_TOLERANCE, EVALUATOR_MODEL, MAX_TOKENS
from ..prompts import EVALUATOR_PLAN, EVALUATOR_RECHECK
from ..schemas import (
    QUERY_PLAN_SCHEMA,
    RECHECK_SCHEMA,
    parse_json_object,
    render_catalog,
    semantic_query_from_json,
)

AGENT_ID = "evaluator_v1"

DESCRIPTOR = AgentDescriptor(
    agent_id=AGENT_ID,
    role=AgentRole.EVALUATOR,
    tool_permissions=(
        ToolScope(tool_name="semantic_layer_query", access=ToolAccess.READ),
    ),
    context_budget_tokens=MAX_TOKENS,
    input_schema={"type": "object", "properties": {"question": {"type": "string"}}},
    output_schema=RECHECK_SCHEMA,
    output_fields=frozenset(
        {"query", "recheck_passed", "discrepancy_pct", "issues", "rows"}
    ),
    eval_suite_ref="evals/evaluator",
)


class EvaluatorAgent:
    """Re-derives the number independently before anyone is shown it.

    Runs on a different model from the SQL Analyst so the recheck does not
    inherit the same blind spots (final architecture §3.9).
    """

    def __init__(
        self,
        *,
        model: ModelPort,
        semantic_layer: SemanticLayerPort,
    ) -> None:
        self._model = model
        self._semantic_layer = semantic_layer

    @property
    def descriptor(self) -> AgentDescriptor:
        return DESCRIPTOR

    async def invoke(self, agent_input: AgentInput) -> AgentOutput:
        question = str(agent_input.state["question"])
        execution_id = str(agent_input.state["execution_id"])
        analyst = agent_input.state["analyst"]
        assert isinstance(analyst, dict)
        catalog = await self._semantic_layer.catalog()

        # Deliberately built from the question alone — the analyst's query is
        # withheld so agreement means two independent routes to one number.
        plan_response = await self._model.complete(
            model=EVALUATOR_MODEL,
            system=EVALUATOR_PLAN,
            messages=[
                ModelMessage(
                    role="user",
                    content=(
                        f"Question: {question}\n\n"
                        f"Governed catalog:\n{render_catalog(catalog)}"
                    ),
                )
            ],
            max_tokens=MAX_TOKENS,
            response_schema=QUERY_PLAN_SCHEMA,
        )
        query = semantic_query_from_json(parse_json_object(plan_response.text)["query"])
        result = await self._semantic_layer.query(query)

        recheck_response = await self._model.complete(
            model=EVALUATOR_MODEL,
            system=EVALUATOR_RECHECK,
            messages=[
                ModelMessage(
                    role="user",
                    content=(
                        f"Question: {question}\n\n"
                        f"Analyst reported: {json.dumps(analyst.get('metrics', []))}\n"
                        f"Analyst summary: {analyst.get('result_summary', '')}\n\n"
                        f"Your independent rows: {json.dumps(list(result.rows))}"
                    ),
                )
            ],
            max_tokens=MAX_TOKENS,
            response_schema=RECHECK_SCHEMA,
        )
        recheck = parse_json_object(recheck_response.text)
        usage = plan_response.usage + recheck_response.usage

        discrepancy = abs(float(recheck["discrepancy_pct"]))
        passed = (
            bool(recheck["recheck_passed"]) and discrepancy <= DISCREPANCY_TOLERANCE
        )
        # An Insight may never be more confident than the weakest step behind
        # it, so the recheck caps rather than replaces the analyst's score.
        analyst_confidence = _analyst_confidence(analyst)
        score = min(_clamp(recheck["confidence"]), analyst_confidence)
        if not passed:
            score = min(score, 0.49)

        return validate_agent_output(
            self,
            AgentOutput(
                fields={
                    "query": query.model_dump(mode="json"),
                    "recheck_passed": passed,
                    "discrepancy_pct": discrepancy,
                    "issues": recheck.get("issues", []),
                    "rows": list(result.rows),
                },
                evidence_refs=(f"artifact://execution/{execution_id}",),
                outcome=ConfidenceOutcome(
                    score=score,
                    calibration_method="evaluator_independent_recheck",
                ),
                # The model the provider actually served, not the role we
                # asked for — the ledger must record what really ran.
                usage=usage,
            ),
        )


def _analyst_confidence(analyst: dict[str, object]) -> float:
    outcome = analyst.get("outcome")
    if isinstance(outcome, dict) and outcome.get("kind") == "confidence":
        return _clamp(outcome["score"])
    return 1.0


def _clamp(value: object) -> float:
    return min(1.0, max(0.0, float(value)))  # type: ignore[arg-type]
