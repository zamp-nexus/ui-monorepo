from __future__ import annotations

import json
from typing import Any

from zentra_domain_agent_execution import (
    SemanticCatalog,
    SemanticFilter,
    SemanticQuery,
    SemanticTimeDimension,
)


class MalformedAgentResponseError(ValueError):
    """The model returned text that does not satisfy the declared schema."""


def _nullable(inner: dict[str, Any]) -> dict[str, Any]:
    return {"anyOf": [inner, {"type": "null"}]}


def _obj(properties: dict[str, Any]) -> dict[str, Any]:
    return {
        "type": "object",
        "properties": properties,
        "required": list(properties),
        "additionalProperties": False,
    }


_STRINGS = {"type": "array", "items": {"type": "string"}}

SEMANTIC_QUERY_SCHEMA = _obj(
    {
        "measures": _STRINGS,
        "dimensions": _STRINGS,
        "time_dimensions": {
            "type": "array",
            "items": _obj(
                {
                    "dimension": {"type": "string"},
                    "granularity": _nullable({"type": "string"}),
                    "date_range": _nullable(_STRINGS),
                }
            ),
        },
        "filters": {
            "type": "array",
            "items": _obj(
                {
                    "member": {"type": "string"},
                    "operator": {"type": "string"},
                    "values": _STRINGS,
                }
            ),
        },
    }
)

METRIC_COMPARISON_SCHEMA = _obj(
    {
        "metric": {"type": "string"},
        "previous_value": {"type": "string"},
        "current_value": {"type": "string"},
        "unit": {"type": "string"},
    }
)

QUERY_PLAN_SCHEMA = _obj(
    {
        "reasoning": {"type": "string"},
        "query": SEMANTIC_QUERY_SCHEMA,
    }
)

ANALYSIS_SCHEMA = _obj(
    {
        "result_summary": {"type": "string"},
        "metrics": {"type": "array", "items": METRIC_COMPARISON_SCHEMA},
        "confidence": {"type": "number"},
    }
)

RECHECK_SCHEMA = _obj(
    {
        "recheck_passed": {"type": "boolean"},
        "discrepancy_pct": {"type": "number"},
        "confidence": {"type": "number"},
        "issues": _STRINGS,
    }
)

TASK_LEDGER_SCHEMA = _obj(
    {
        "tasks": {
            "type": "array",
            "items": _obj(
                {
                    "role": {"type": "string"},
                    "objective": {"type": "string"},
                }
            ),
        }
    }
)

SYNTHESIS_SCHEMA = _obj(
    {
        "headline": {"type": "string"},
        "summary": {"type": "string"},
        "contradictions": _STRINGS,
    }
)


def parse_json_object(text: str) -> dict[str, Any]:
    try:
        parsed = json.loads(text)
    except json.JSONDecodeError as error:
        raise MalformedAgentResponseError(
            "Agent response was not valid JSON"
        ) from error
    if not isinstance(parsed, dict):
        raise MalformedAgentResponseError("Agent response was not a JSON object")
    return parsed


def semantic_query_from_json(payload: dict[str, Any]) -> SemanticQuery:
    try:
        return SemanticQuery(
            measures=tuple(payload.get("measures", ())),
            dimensions=tuple(payload.get("dimensions", ())),
            time_dimensions=tuple(
                SemanticTimeDimension(
                    dimension=item["dimension"],
                    granularity=item.get("granularity"),
                    date_range=(
                        (item["date_range"][0], item["date_range"][1])
                        if item.get("date_range")
                        else None
                    ),
                )
                for item in payload.get("time_dimensions", ())
            ),
            filters=tuple(
                SemanticFilter(
                    member=item["member"],
                    operator=item["operator"],
                    values=tuple(item.get("values", ())),
                )
                for item in payload.get("filters", ())
            ),
        )
    except (KeyError, IndexError, TypeError, ValueError) as error:
        raise MalformedAgentResponseError(
            f"Agent proposed an unusable semantic query: {error}"
        ) from error


def render_catalog(catalog: SemanticCatalog) -> str:
    measures = "\n".join(
        f"- {measure.name} ({measure.type})" for measure in catalog.measures
    )
    dimensions = "\n".join(
        f"- {dimension.name} ({dimension.type})" for dimension in catalog.dimensions
    )
    return f"Measures:\n{measures}\n\nDimensions:\n{dimensions}"
