"""A bounded executor for published Workflow documents.

The engine owns graph transitions. Agents may propose a named route, but can
never reach a node that the published Workflow did not declare.
"""

from __future__ import annotations

from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from typing import Any

WorkflowNode = dict[str, Any]
AgentInvoker = Callable[[WorkflowNode, str], Awaitable["WorkflowStep"]]


@dataclass(frozen=True, slots=True)
class WorkflowStep:
    handoff: str
    route: str | None = None


@dataclass(frozen=True, slots=True)
class WorkflowResult:
    output: str
    nodes: tuple[str, ...]
    routes: tuple[str, ...]


class WorkflowEngine:
    """Runs one declared path, enforcing routes and bounded loop edges."""

    def __init__(self, definition: dict[str, Any]) -> None:
        self._nodes = {node["id"]: node for node in definition["nodes"]}
        self._edges = tuple(definition["edges"])

    async def run(self, message: str, invoke: AgentInvoker) -> WorkflowResult:
        current = self._next("trigger", None)
        handoff = message
        nodes: list[str] = []
        routes: list[str] = []
        loop_counts: dict[str, int] = {}

        while current["type"] != "result":
            node_id = current["id"]
            nodes.append(node_id)
            step = await invoke(current, handoff)
            outgoing = [edge for edge in self._edges if edge["source"] == node_id]
            route = step.route
            if len(outgoing) == 1:
                route = outgoing[0].get("data", {}).get("route", "success")
            if not route:
                raise ValueError(f"{node_id} must choose a declared route")
            edge = next(
                (
                    candidate
                    for candidate in outgoing
                    if candidate.get("data", {}).get("route", "success") == route
                ),
                None,
            )
            if edge is None:
                raise ValueError(f"{node_id} chose undeclared route {route!r}")
            limit = edge.get("data", {}).get("max_iterations")
            if edge.get("data", {}).get("is_loop"):
                loop_counts[edge["id"]] = loop_counts.get(edge["id"], 0) + 1
                if loop_counts[edge["id"]] > limit:
                    raise ValueError(f"loop limit reached for route {route!r}")
            handoff = step.handoff
            routes.append(route)
            current = self._nodes[edge["target"]]

        return WorkflowResult(output=handoff, nodes=tuple(nodes), routes=tuple(routes))

    def _next(self, source: str, route: str | None) -> WorkflowNode:
        edge = next(
            (
                candidate
                for candidate in self._edges
                if candidate["source"] == source
                and (route is None or candidate.get("data", {}).get("route") == route)
            ),
            None,
        )
        if edge is None:
            raise ValueError(f"{source} has no declared outgoing route")
        return self._nodes[edge["target"]]
