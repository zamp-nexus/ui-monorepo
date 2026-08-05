"""Public wire contracts and the system-owned Workflow Studio default."""

from __future__ import annotations

from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, Field

WORKFLOW_TOOL_CATALOG = (
    "semantic_catalog_search",
    "semantic_query",
    "raw_query",
)


class WorkflowDocumentRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str = Field(min_length=1, max_length=120)
    definition: dict[str, Any]


class CloneDefaultRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str = Field(default="Analytics workflow", min_length=1, max_length=120)


class WorkflowExecuteRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    message: str = Field(min_length=1, max_length=4_000)
    workflow_version: int | None = Field(default=None, ge=1)


class WorkflowExecutionResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    execution_id: str
    workflow_id: str
    workflow_version: int
    status: str
    output: str | None = None
    nodes: list[str] = Field(default_factory=list)
    routes: list[str] = Field(default_factory=list)
    error: str | None = None


class WorkflowSummaryResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    workflow_id: str
    name: str
    is_system: bool
    published_version: int | None
    updated_at: datetime | None


class WorkflowDetailResponse(WorkflowSummaryResponse):
    definition: dict[str, Any]
    versions: list[int] = Field(default_factory=list)


DEFAULT_WORKFLOW_ID = "default-analytics"
DEFAULT_WORKFLOW_DEFINITION: dict[str, Any] = {
    "nodes": [
        {
            "id": "trigger",
            "type": "trigger",
            "position": {"x": 0, "y": 230},
            "data": {
                "label": "Analysis request",
                "responsibility": "Starts a governed analytical run.",
            },
        },
        {
            "id": "orchestrator",
            "type": "agent",
            "position": {"x": 250, "y": 230},
            "data": {
                "label": "Orchestrator",
                "role": "orchestrator",
                "controller": True,
                "responsibility": "Plans bounded follow-up work.",
                "skills": ["analysis planning"],
                "tools": [],
            },
        },
        {
            "id": "analyst",
            "type": "agent",
            "position": {"x": 520, "y": 230},
            "data": {
                "label": "Cube Analyst",
                "role": "cube_analyst",
                "responsibility": "Measures governed metrics.",
                "skills": ["semantic analysis"],
                "tools": ["semantic_catalog_search", "semantic_query", "raw_query"],
            },
        },
        {
            "id": "evaluator",
            "type": "agent",
            "position": {"x": 790, "y": 230},
            "data": {
                "label": "Evaluator",
                "role": "evaluator",
                "responsibility": "Validates evidence and requests rechecks.",
                "skills": ["evidence validation"],
                "tools": [],
            },
        },
        {
            "id": "insight",
            "type": "agent",
            "position": {"x": 1060, "y": 230},
            "data": {
                "label": "Insight",
                "role": "insight",
                "responsibility": "Drafts a finding from validated evidence.",
                "skills": ["finding synthesis"],
                "tools": [],
            },
        },
        {
            "id": "result",
            "type": "result",
            "position": {"x": 1320, "y": 230},
            "data": {
                "label": "Published finding",
                "responsibility": "Returns the governed result.",
            },
        },
    ],
    "edges": [
        {
            "id": "trigger-orchestrator",
            "source": "trigger",
            "target": "orchestrator",
            "data": {"route": "success"},
        },
        {
            "id": "orchestrator-analyst",
            "source": "orchestrator",
            "target": "analyst",
            "data": {"route": "analyze"},
        },
        {
            "id": "analyst-evaluator",
            "source": "analyst",
            "target": "evaluator",
            "data": {"route": "evidence"},
        },
        {
            "id": "evaluator-orchestrator",
            "source": "evaluator",
            "target": "orchestrator",
            "data": {"route": "retry", "is_loop": True, "max_iterations": 3},
        },
        {
            "id": "orchestrator-insight",
            "source": "orchestrator",
            "target": "insight",
            "data": {"route": "synthesize"},
        },
        {
            "id": "insight-result",
            "source": "insight",
            "target": "result",
            "data": {"route": "success"},
        },
    ],
}
