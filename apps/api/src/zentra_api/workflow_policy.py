"""Canonical roles and least-privilege tool grants for authored Workflows."""

from __future__ import annotations

from collections.abc import Mapping, Sequence
from typing import Any

from zentra_domain_agent_execution import AgentRole

WORKFLOW_TOOL_CATALOG = (
    "connection_inventory",
    "schema_inspect",
    "data_query",
)
DATA_DISCOVERY_TOOLS = frozenset(WORKFLOW_TOOL_CATALOG)
DATA_DISCOVERY_ROLES = frozenset({AgentRole.CUBE_ANALYST, AgentRole.EVALUATOR})
_ROLE_ALIASES: dict[str, AgentRole] = {
    "controller": AgentRole.ORCHESTRATOR,
    "analyst": AgentRole.CUBE_ANALYST,
    "reviewer": AgentRole.EVALUATOR,
    "writer": AgentRole.INSIGHT,
    "custom": AgentRole.CONVERSATIONAL,
}
_WORKFLOW_ROLES = frozenset(
    {
        AgentRole.ORCHESTRATOR,
        AgentRole.CUBE_ANALYST,
        AgentRole.EVALUATOR,
        AgentRole.INSIGHT,
        AgentRole.CONVERSATIONAL,
    }
)


def workflow_agent_role(data: Mapping[str, Any]) -> AgentRole | None:
    """Resolve a stored role, including pre-canonical Studio aliases."""
    raw_role = data.get("role")
    if raw_role is None:
        return (
            AgentRole.ORCHESTRATOR
            if data.get("controller")
            else AgentRole.CONVERSATIONAL
        )
    if not isinstance(raw_role, str):
        return None
    if raw_role in _ROLE_ALIASES:
        return _ROLE_ALIASES[raw_role]
    try:
        role = AgentRole(raw_role)
    except ValueError:
        return None
    return role if role in _WORKFLOW_ROLES else None


def workflow_role_error(data: Mapping[str, Any], tools: Sequence[object]) -> str | None:
    """Return a stable validation error for role/tool policy violations."""
    role = workflow_agent_role(data)
    if role is None:
        return "Workflow agents need a supported canonical role"
    if data.get("controller") and role is not AgentRole.ORCHESTRATOR:
        return "The Workflow controller must have the orchestrator role"
    if any(tool in DATA_DISCOVERY_TOOLS for tool in tools) and role not in DATA_DISCOVERY_ROLES:
        return "Only Cube Analyst and Evaluator may use data tools"
    return None
