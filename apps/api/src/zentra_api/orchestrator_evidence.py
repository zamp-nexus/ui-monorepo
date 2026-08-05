"""Pure state and evidence transformations for the Analysis Run loop."""

from __future__ import annotations

from collections.abc import Sequence
from typing import Any
from uuid import UUID

from zentra_domain_agent_execution import (
    OUTCOME_ADAPTER,
    AgentOutput,
    AgentRole,
    OutcomeSignal,
)
from zentra_domain_analysis_run import AnalysisRunBoard, ConflictStatus

from .outcomes import InsightOutcome, ValidatedEvidence

_EXCLUDED_FROM_STATE = frozenset({"rows"})


def for_state(output: AgentOutput) -> dict[str, Any]:
    """Return the agent state that later steps may see, excluding result rows."""
    return {
        "fields": {
            key: value
            for key, value in output.fields.items()
            if key not in _EXCLUDED_FROM_STATE
        },
        "metrics": output.fields.get("metrics", []),
        "result_summary": output.fields.get("result_summary", ""),
        "issues": output.fields.get("issues", []),
        "recheck_passed": output.fields.get("recheck_passed"),
        "discrepancy_pct": output.fields.get("discrepancy_pct"),
        "outcome": output.outcome.model_dump(mode="json"),
        "evidence_refs": list(output.evidence_refs),
        "model": output.usage.model,
        "fallbacks": list(output.fallbacks),
        "sample_size": output.fields.get("sample_size"),
    }


def outcome_signal(payload: dict[str, Any]) -> OutcomeSignal:
    return OUTCOME_ADAPTER.validate_python(payload)


def insight_outcome_from_state(state: dict[str, Any]) -> InsightOutcome:
    fields = state["fields"]
    return InsightOutcome(
        execution_id=UUID(state["execution_id"]),
        headline=str(fields["headline"]),
        summary=str(fields["summary"]),
        claims=list(fields.get("claims", [])),
        contradictions=tuple(fields.get("contradictions", [])),
        root_cause=str(fields["root_cause"]),
        outcome=outcome_signal(state["outcome"]),
        model=state.get("model"),
        fallbacks=tuple(state.get("fallbacks", [])),
    )


def validated_evidence_from_state(
    analyst_state: dict[str, Any],
) -> tuple[ValidatedEvidence, ...]:
    execution_id = analyst_state.get("execution_id")
    if not execution_id:
        return ()
    query = mapping(mapping(analyst_state.get("fields")).get("query"))
    time_dimensions = [mapping(item) for item in query.get("time_dimensions", [])]
    grain = next(
        (
            str(item["granularity"])
            for item in time_dimensions
            if item.get("granularity")
        ),
        None,
    )
    filters = tuple(mapping(item) for item in query.get("filters", []))
    return tuple(
        ValidatedEvidence(
            metric=str(metric.get("metric")),
            previous_value=str(metric.get("previous_value")),
            current_value=str(metric.get("current_value")),
            previous_period=metric.get("previous_label"),
            current_period=metric.get("current_label"),
            filters=filters,
            grain=grain,
            producing_execution_id=UUID(str(execution_id)),
        )
        for metric in (mapping(item) for item in analyst_state.get("metrics", []))
        if metric.get("metric")
    )


def mapping(value: object) -> dict[str, Any]:
    return value if isinstance(value, dict) else {}


class UnsettledConflictError(RuntimeError):
    """Insight was reached with a contradiction nobody accounted for."""


def accept_followups(
    proposals: Sequence[dict[str, Any]], *, question: str, limit: int
) -> tuple[str, ...]:
    seen = {question.strip().casefold()}
    accepted: list[str] = []
    for proposal in proposals:
        if proposal.get("role") != AgentRole.CUBE_ANALYST.value:
            continue
        objective = str(proposal.get("objective", "")).strip()
        if not objective or objective.casefold() in seen:
            continue
        seen.add(objective.casefold())
        accepted.append(objective)
        if len(accepted) == limit:
            break
    return tuple(accepted)


def documented_conflicts(board: AnalysisRunBoard) -> tuple[str, ...]:
    return tuple(
        conflict.description
        for conflict in board.conflicts
        if conflict.status is not ConflictStatus.OPEN
    )


def require_settled_conflicts(board: AnalysisRunBoard) -> None:
    open_conflicts = board.unresolved_conflicts
    if open_conflicts:
        raise UnsettledConflictError(
            f"{len(open_conflicts)} contradiction(s) on the Board were neither "
            "resolved nor documented before Insight"
        )
