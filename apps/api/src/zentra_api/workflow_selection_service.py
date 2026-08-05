"""Intake-guided selection of a published custom Workflow.

The model may recommend only an explicitly supplied candidate.  This service
owns the final allow-list check, making a malformed or stale recommendation a
safe system-workflow fallback rather than an execution capability.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any
from uuid import UUID, uuid4

from zentra_adapter_langgraph import IntakeAgent
from zentra_adapter_model_providers import (
    ModelTier,
    ProviderCircuitBreaker,
    RoutedModelClient,
)
from zentra_domain_agent_execution import AgentInput, SemanticLayerPort
from zentra_application_analysis_run import RoutingDisposition, RoutingResult


@dataclass(frozen=True, slots=True)
class WorkflowCandidate:
    workflow_id: UUID
    workflow_version: int
    name: str
    purpose: str
    tags: tuple[str, ...]
    example_requests: tuple[str, ...]
    priority: int

    def prompt_value(self) -> dict[str, object]:
        return {
            "workflow_id": str(self.workflow_id),
            "name": self.name,
            "purpose": self.purpose,
            "tags": self.tags,
            "example_requests": self.example_requests,
            "priority": self.priority,
        }


@dataclass(frozen=True, slots=True)
class WorkflowSelection:
    candidate: WorkflowCandidate | None
    reason: str | None
    fallback: bool
    routing: RoutingResult | None = None


def _routing_from_fields(fields: dict[str, object]) -> RoutingResult:
    disposition = str(fields.get("disposition", "unsupported"))
    normalized = fields.get("normalized_question")
    if disposition == "resolved" and normalized:
        canonical = str(normalized)
        return RoutingResult(
            disposition=RoutingDisposition.RESOLVED,
            scenario_key=None,
            canonical_question=canonical,
            clarification=None,
            suggestions=(),
        )
    if disposition == "not_analytical":
        return RoutingResult(
            disposition=RoutingDisposition.NOT_ANALYTICAL,
            scenario_key=None,
            canonical_question=None,
            clarification=None,
            suggestions=(),
        )
    return RoutingResult(
        disposition=RoutingDisposition.AMBIGUOUS if disposition == "ambiguous" else RoutingDisposition.UNSUPPORTED,
        scenario_key=None,
        canonical_question=None,
        clarification=str(fields.get("clarification") or ""),
        suggestions=(),
    )


def selection_from_recommendation(
    candidates: tuple[WorkflowCandidate, ...], workflow_id: object, reason: object
) -> WorkflowSelection:
    """Accept exactly one ID from the server-provided candidate allow-list."""
    if not isinstance(workflow_id, str):
        return WorkflowSelection(candidate=None, reason=None, fallback=False)
    try:
        selected_id = UUID(workflow_id)
    except ValueError:
        return WorkflowSelection(candidate=None, reason="Intake recommended an unavailable Workflow.", fallback=True)
    candidate = next((item for item in candidates if item.workflow_id == selected_id), None)
    if candidate is None:
        return WorkflowSelection(candidate=None, reason="Intake recommended an unavailable Workflow.", fallback=True)
    return WorkflowSelection(
        candidate=candidate,
        reason=str(reason)[:500] if reason else None,
        fallback=False,
    )


class WorkflowSelectionService:
    def __init__(self, *, models: dict[Any, Any], semantic_layer: SemanticLayerPort) -> None:
        self._models = models
        self._semantic_layer = semantic_layer

    async def select(
        self, *, organization_id: UUID, message: str, candidates: tuple[WorkflowCandidate, ...]
    ) -> WorkflowSelection:
        if not candidates:
            return WorkflowSelection(candidate=None, reason="No eligible custom Workflow.", fallback=True)
        model = RoutedModelClient(
            tier=ModelTier.FREE,
            clients=self._models,
            breaker=ProviderCircuitBreaker(),
        )
        try:
            output = await IntakeAgent(model=model, semantic_layer=self._semantic_layer).invoke(
                AgentInput(
                    analysis_run_id=uuid4(),
                    organization_id=organization_id,
                    state={"question": message, "workflow_candidates": [candidate.prompt_value() for candidate in candidates]},
                )
            )
        except (RuntimeError, ValueError):
            return WorkflowSelection(
                candidate=None,
                reason="Workflow selection was unavailable.",
                fallback=True,
            )
        routing = _routing_from_fields(output.fields)
        if routing.disposition is not RoutingDisposition.RESOLVED:
            return WorkflowSelection(
                candidate=None,
                reason=None,
                fallback=False,
                routing=routing,
            )
        selection = selection_from_recommendation(
            candidates,
            output.fields.get("workflow_id"),
            output.fields.get("workflow_reason"),
        )
        return WorkflowSelection(
            candidate=selection.candidate,
            reason=selection.reason,
            fallback=selection.fallback,
            routing=routing,
        )
