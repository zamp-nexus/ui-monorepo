from __future__ import annotations

import json
from typing import Any

from zentra_domain_agent_execution import (
    SemanticCatalog,
    SemanticDimension,
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

# The labels are nullable rather than absent: _obj requires every property, which
# strict structured output demands, so nullability is how the schema says "you
# must answer, and 'this is not a period comparison' is an answer".
METRIC_COMPARISON_SCHEMA = _obj(
    {
        "metric": {"type": "string"},
        "previous_value": {"type": "string"},
        "previous_label": _nullable({"type": "string"}),
        "current_value": {"type": "string"},
        "current_label": _nullable({"type": "string"}),
        "unit": {"type": "string"},
    }
)

QUERY_PLAN_SCHEMA = _obj(
    {
        "reasoning": {"type": "string"},
        "query": SEMANTIC_QUERY_SCHEMA,
    }
)

# sample_size is extraction, not introspection: reading how many underlying
# records an aggregate covers is something models do reliably, unlike scoring
# their own confidence. Code turns it into a ceiling the model cannot argue with.
ANALYSIS_SCHEMA = _obj(
    {
        "result_summary": {"type": "string"},
        "metrics": {"type": "array", "items": METRIC_COMPARISON_SCHEMA},
        "sample_size": {"type": "integer"},
        "confidence": {"type": "number"},
    }
)

RECHECK_SCHEMA = _obj(
    {
        "recheck_passed": {"type": "boolean"},
        "discrepancy_pct": {"type": "number"},
        "sample_size": {"type": "integer"},
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

# The Insight Agent's structured output.
#
# `kind` is required on every claim rather than inferred, because the
# observed/interpretation split is the one thing a reader cannot re-derive from
# prose. `metric` and `value` exist so a claim can be checked against the
# validated aggregate it says it rests on — a claim naming no governed metric,
# or naming a value the aggregate does not carry, is refused rather than shown.
#
# `root_cause_resolved` is asked for precisely so it can be refused: ADR 0011
# admits no Root Cause Claim until a causal-evidence standard is accepted, so a
# model asserting one has overclaimed and the whole draft fails closed.
DRAFT_FINDING_SCHEMA = _obj(
    {
        "headline": {"type": "string"},
        "summary": {"type": "string"},
        "claims": {
            "type": "array",
            "items": _obj(
                {
                    "kind": {
                        "type": "string",
                        "enum": ["observed", "interpretation"],
                    },
                    "text": {"type": "string"},
                    "metric": _nullable({"type": "string"}),
                    "value": _nullable({"type": "string"}),
                    "period": _nullable({"type": "string"}),
                }
            ),
        },
        "contradictions": _STRINGS,
        "root_cause_resolved": {"type": "boolean"},
        "confidence": {"type": "number"},
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


def _render_dimension(dimension: SemanticDimension) -> str:
    """Name, type, and the values it holds where they are few enough to list.

    Without the values an agent can only guess how they are spelled — a filter
    on "North America" against data storing "NA" returns zero rows rather than
    an error, and the agent correctly reports that it found nothing.
    """
    line = f"- {dimension.name} ({dimension.type})"
    if dimension.values:
        return f"{line} — one of: {', '.join(dimension.values)}"
    return line


def render_catalog(catalog: SemanticCatalog) -> str:
    measures = "\n".join(
        f"- {measure.name} ({measure.type})" for measure in catalog.measures
    )
    dimensions = "\n".join(
        _render_dimension(dimension) for dimension in catalog.dimensions
    )
    return f"Measures:\n{measures}\n\nDimensions:\n{dimensions}"
