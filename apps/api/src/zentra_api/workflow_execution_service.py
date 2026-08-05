"""Invokes user-authored Workflow Agents through the governed tool runtime."""

from __future__ import annotations

from collections.abc import Callable
from typing import Any
from uuid import UUID

from zentra_adapter_langgraph import (
    AgentRuntime,
    ConnectionInventoryTool,
    DataDiscoveryPort,
    DataQueryTool,
    SchemaInspectTool,
    SkillRegistry,
    ToolRegistry,
)
from zentra_adapter_model_providers import (
    ModelTier,
    ProviderCircuitBreaker,
    RoutedModelClient,
)
from zentra_domain_agent_execution import (
    AgentDescriptor,
    ModelMessage,
    ToolAccess,
    ToolScope,
)

from .cube_scope import ScopedCubeSemanticLayers
from .workflow_policy import workflow_agent_role
from .workflow_runtime import WorkflowEngine, WorkflowResult, WorkflowStep

_OUTPUT_SCHEMA = {
    "type": "object",
    "properties": {
        "handoff": {"type": "string"},
        "route": {"type": "string"},
    },
    "required": ["handoff"],
    "additionalProperties": False,
}


class WorkflowExecutionService:
    def __init__(
        self,
        *,
        models: dict[Any, Any],
        semantic_layers: ScopedCubeSemanticLayers,
        discovery_factory: Callable[[], DataDiscoveryPort] | None = None,
    ) -> None:
        self._models = models
        self._semantic_layers = semantic_layers
        self._discovery_factory = discovery_factory

    async def run(
        self,
        definition: dict[str, Any],
        *,
        organization_id: UUID,
        data_connection_id: UUID | tuple[UUID, ...] | None,
        message: str,
    ) -> WorkflowResult:
        semantic_layer = await self._semantic_layers.resolve(
            organization_id=organization_id, data_connection_id=data_connection_id
        )
        model = RoutedModelClient(
            tier=ModelTier.FREE,
            clients=self._models,
            breaker=ProviderCircuitBreaker(),
        )
        discovery = self._discovery_factory() if self._discovery_factory else None

        async def invoke(node: dict[str, Any], handoff: str) -> WorkflowStep:
            data = node["data"]
            tools = tuple(data.get("tools", ()))
            role = workflow_agent_role(data)
            if role is None:
                raise ValueError("Workflow agent has an unsupported role")
            descriptor = AgentDescriptor(
                agent_id=f"workflow-{node['id']}",
                role=role,
                tool_permissions=tuple(
                    ToolScope(tool_name=tool, access=ToolAccess.READ) for tool in tools
                ),
                context_budget_tokens=4_000,
                input_schema={"type": "object"},
                output_schema=_OUTPUT_SCHEMA,
                output_fields=frozenset({"handoff", "route"}),
                eval_suite_ref="workflow-v1",
            )
            query_tool = DataQueryTool(semantic_layer)
            registered_tools = [query_tool]
            if discovery is not None:
                registered_tools = [
                    ConnectionInventoryTool(discovery, organization_id),
                    SchemaInspectTool(discovery, organization_id),
                    query_tool,
                ]
            runtime = AgentRuntime(
                model=model,
                tools=ToolRegistry(tuple(registered_tools)),
                skills=SkillRegistry(),
            )
            system = (
                f"You are {data.get('label', 'a workflow agent')}. "
                f"Role: {data.get('role', 'custom')}. "
                f"Responsibility: {data.get('responsibility', '')}. "
                f"Instructions: {' '.join(data.get('skills', ())) or 'None.'} "
                "Return a concise handoff. If this node has multiple outgoing routes, "
                "set route to exactly one declared route name."
            )
            result = await runtime.run(
                descriptor=descriptor,
                system=system,
                messages=[ModelMessage(role="user", content=handoff)],
                response_schema=_OUTPUT_SCHEMA,
            )
            output = result.output
            return WorkflowStep(
                handoff=str(output["handoff"]),
                route=str(output["route"]) if output.get("route") else None,
            )

        return await WorkflowEngine(definition).run(message, invoke)
