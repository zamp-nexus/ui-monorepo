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
    merged_fallbacks,
    validate_agent_output,
)

from ..constants import MAX_TOKENS, SQL_ANALYST_MODEL
from ..prompts import SQL_ANALYST_INTERPRET, SQL_ANALYST_PLAN
from ..schemas import (
    ANALYSIS_SCHEMA,
    QUERY_PLAN_SCHEMA,
    parse_json_object,
    render_catalog,
    semantic_query_from_json,
)

AGENT_ID = "sql_analyst_v1"

DESCRIPTOR = AgentDescriptor(
    agent_id=AGENT_ID,
    role=AgentRole.SQL_ANALYST,
    # The only capability this agent holds. There is no raw-table port in the
    # tree for it to be granted, which is what makes ADR-003 structural.
    tool_permissions=(
        ToolScope(tool_name="semantic_layer_query", access=ToolAccess.READ),
    ),
    context_budget_tokens=MAX_TOKENS,
    input_schema={"type": "object", "properties": {"question": {"type": "string"}}},
    output_schema=ANALYSIS_SCHEMA,
    output_fields=frozenset(
        {"query", "reasoning", "result_summary", "metrics", "rows", "sample_size"}
    ),
    eval_suite_ref="evals/sql_analyst",
)


class SqlAnalystAgent:
    """Writes one governed query, runs it, and reports what it shows."""

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
        catalog = await self._semantic_layer.catalog()

        plan_response = await self._model.complete(
            model=SQL_ANALYST_MODEL,
            system=SQL_ANALYST_PLAN,
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
        plan = parse_json_object(plan_response.text)
        query = semantic_query_from_json(plan["query"])

        # Raises UnknownSemanticMemberError before any query runs if the model
        # reached for a member the catalog does not define.
        result = await self._semantic_layer.query(query)

        analysis_response = await self._model.complete(
            model=SQL_ANALYST_MODEL,
            system=SQL_ANALYST_INTERPRET,
            messages=[
                ModelMessage(
                    role="user",
                    content=(
                        f"Question: {question}\n\n"
                        f"Query: {query.model_dump_json()}\n\n"
                        f"Rows: {json.dumps(list(result.rows))}"
                    ),
                )
            ],
            max_tokens=MAX_TOKENS,
            response_schema=ANALYSIS_SCHEMA,
        )
        analysis = parse_json_object(analysis_response.text)
        usage = plan_response.usage + analysis_response.usage

        return validate_agent_output(
            self,
            AgentOutput(
                fields={
                    "query": query.model_dump(mode="json"),
                    "reasoning": plan.get("reasoning", ""),
                    "result_summary": analysis["result_summary"],
                    "metrics": analysis["metrics"],
                    "sample_size": int(analysis["sample_size"]),
                    "rows": list(result.rows),
                },
                evidence_refs=(f"artifact://execution/{execution_id}",),
                outcome=ConfidenceOutcome(
                    score=_clamp(analysis["confidence"]),
                    calibration_method="sql_analyst_self_reported",
                ),
                # The model the provider actually served, not the role we
                # asked for — the ledger must record what really ran.
                usage=usage,
                fallbacks=merged_fallbacks(plan_response, analysis_response),
            ),
        )


def _clamp(value: object) -> float:
    return min(1.0, max(0.0, float(value)))  # type: ignore[arg-type]
