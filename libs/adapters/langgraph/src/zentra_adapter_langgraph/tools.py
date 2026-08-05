"""The tools an Agent may be granted, and the registry that gates them.

Connection metadata tools receive a safe, tenant-scoped Connector view through
``DataDiscoveryPort``. `data_query` reaches rows through `SemanticLayerPort`
and uses its raw compiled-member path, still scoped to one tenant connection.

`AgentDescriptor.tool_permissions` is the gate. A tool outside a descriptor's
permissions is never offered to the model *and* is refused if named anyway,
because a model can hallucinate a tool name it was never shown.
"""

from __future__ import annotations

from collections.abc import Sequence
from typing import Protocol
from uuid import UUID

from pydantic.types import JsonValue
from zentra_domain_agent_execution import (
    AgentDescriptor,
    InvalidSemanticQueryError,
    SemanticLayerPort,
    SemanticQuery,
    ToolAccess,
    ToolDefinition,
    ToolPort,
    ToolResult,
    ToolScope,
    UnauthorizedToolError,
    UnknownSemanticMemberError,
)

from .schemas import (
    DATA_QUERY_SCHEMA,
    MalformedAgentResponseError,
    semantic_query_from_json,
)

#: Rows come back to the model, so this bounds a prompt as much as a payload.
#: The Analyst asks for aggregates; a result this long means the query grouped
#: by something it should not have.
MAX_QUERY_ROWS = 200


class DataDiscoveryPort(Protocol):
    """Tenant-scoped connection metadata made safe for agent prompts."""

    async def connection_inventory(
        self, organization_id: UUID
    ) -> dict[str, JsonValue]: ...

    async def schema_inspect(
        self, organization_id: UUID, connection_id: UUID, table_name: str | None
    ) -> dict[str, JsonValue]: ...


class ConnectionInventoryTool:
    name = "connection_inventory"

    def __init__(self, discovery: DataDiscoveryPort, organization_id: UUID) -> None:
        self._discovery = discovery
        self._organization_id = organization_id

    @property
    def definition(self) -> ToolDefinition:
        return ToolDefinition(
            name=self.name,
            description=(
                "List this tenant's data connections with their total count, ids, "
                "names, readiness, catalog status, table count, and confirmed joins. "
                "Choose one id before inspecting schema or querying."
            ),
            input_schema={
                "type": "object",
                "properties": {},
                "additionalProperties": False,
            },
        )

    @property
    def scope(self) -> ToolScope:
        return ToolScope(tool_name=self.name, access=ToolAccess.READ)

    async def invoke(self, arguments: dict[str, JsonValue]) -> ToolResult:
        try:
            content = await self._discovery.connection_inventory(self._organization_id)
        except (LookupError, ValueError) as error:
            return _refusal(str(error))
        return ToolResult(call_id="", content=str(content))


class SchemaInspectTool:
    name = "schema_inspect"

    def __init__(self, discovery: DataDiscoveryPort, organization_id: UUID) -> None:
        self._discovery = discovery
        self._organization_id = organization_id

    @property
    def definition(self) -> ToolDefinition:
        return ToolDefinition(
            name=self.name,
            description=(
                "Inspect one connection's agent-visible schema. Without table_name, "
                "returns its compact table overview. With a table, returns typed "
                "fields, available profiles, and confirmed joins touching it."
            ),
            input_schema={
                "type": "object",
                "properties": {
                    "connection_id": {"type": "string", "format": "uuid"},
                    "table_name": {"anyOf": [{"type": "string"}, {"type": "null"}]},
                },
                "required": ["connection_id"],
                "additionalProperties": False,
            },
        )

    @property
    def scope(self) -> ToolScope:
        return ToolScope(tool_name=self.name, access=ToolAccess.READ)

    async def invoke(self, arguments: dict[str, JsonValue]) -> ToolResult:
        try:
            connection_id = UUID(str(arguments["connection_id"]))
        except (KeyError, ValueError):
            return _refusal(
                "connection_id must be a UUID returned by connection_inventory"
            )
        table_name = arguments.get("table_name")
        if table_name is not None and not isinstance(table_name, str):
            return _refusal("table_name must be a string or null")
        try:
            content = await self._discovery.schema_inspect(
                self._organization_id, connection_id, table_name
            )
        except (LookupError, ValueError) as error:
            return _refusal(str(error))
        return ToolResult(call_id="", content=str(content))


class DataQueryTool:
    """Run one structured raw Cube query against exactly one selected source."""

    name = "data_query"

    def __init__(self, semantic_layer: SemanticLayerPort) -> None:
        self._semantic_layer = semantic_layer
        self.last_query: SemanticQuery | None = None
        self.last_rows: tuple[dict[str, JsonValue], ...] = ()

    @property
    def definition(self) -> ToolDefinition:
        return ToolDefinition(
            name=self.name,
            description=(
                "Run a structured query against any compiled member in one selected "
                "tenant connection. source_id is required. SQL and cross-source joins "
                "are not supported."
            ),
            input_schema=DATA_QUERY_SCHEMA,
        )

    @property
    def scope(self) -> ToolScope:
        return ToolScope(tool_name=self.name, access=ToolAccess.READ)

    async def invoke(self, arguments: dict[str, JsonValue]) -> ToolResult:
        try:
            query = semantic_query_from_json(dict(arguments))
            if query.source_id is None:
                raise MalformedAgentResponseError("source_id is required")
            await self._validate_source_scope(query)
        except (InvalidSemanticQueryError, MalformedAgentResponseError) as error:
            return _refusal(str(error))
        try:
            result = await self._semantic_layer.query_raw(query)
        except (UnknownSemanticMemberError, InvalidSemanticQueryError) as error:
            return _refusal(str(error))
        self.last_query = query
        self.last_rows = result.rows
        return _render_query_result(result.rows)

    async def _validate_source_scope(self, query: SemanticQuery) -> None:
        source_id = query.source_id
        assert source_id is not None
        prefix = f"{source_id}::"
        members = (
            *query.measures,
            *query.dimensions,
            *(item.dimension for item in query.time_dimensions),
            *(item.member for item in query.filters),
        )
        if any(not member.startswith(prefix) for member in members):
            raise InvalidSemanticQueryError(
                "All query members must belong to the selected source_id; "
                "cross-source joins are not supported."
            )
        catalog = await self._semantic_layer.catalog()
        known_sources = {
            member.name.split("::", maxsplit=1)[0]
            for member in (*catalog.measures, *catalog.dimensions)
            if "::" in member.name
        }
        if str(source_id) not in known_sources:
            raise InvalidSemanticQueryError(
                "The requested source is not available to this agent."
            )


def data_discovery_tools(
    *,
    semantic_layer: SemanticLayerPort,
    discovery: DataDiscoveryPort | None,
    organization_id: UUID,
    query_tool: DataQueryTool | None = None,
) -> tuple[ToolPort, ...]:
    """Build the one governed data-tool surface for an agent invocation."""
    query_tool = query_tool or DataQueryTool(semantic_layer)
    if discovery is None:
        return (query_tool,)
    return (
        ConnectionInventoryTool(discovery, organization_id),
        SchemaInspectTool(discovery, organization_id),
        query_tool,
    )


class ToolRegistry:
    """The tools this deployment has, filtered per Agent by its descriptor."""

    def __init__(self, tools: Sequence[ToolPort]) -> None:
        self._tools = {tool.definition.name: tool for tool in tools}

    def definitions_for(
        self, descriptor: AgentDescriptor
    ) -> tuple[ToolDefinition, ...]:
        """What this Agent may be offered. Never the whole registry."""
        return tuple(
            tool.definition
            for name, tool in self._tools.items()
            if name in _permitted(descriptor)
        )

    def resolve(self, descriptor: AgentDescriptor, name: str) -> ToolPort:
        """The tool by that name, if this Agent holds it.

        Checked again on call rather than trusting that only offered tools get
        named: a model can invent a tool name it was never shown, and on a
        long conversation it can name one from an earlier, differently-scoped
        turn.
        """
        if name not in _permitted(descriptor):
            raise UnauthorizedToolError(
                f"{descriptor.agent_id} holds no permission for tool {name!r}"
            )
        tool = self._tools.get(name)
        if tool is None:
            raise UnauthorizedToolError(f"No tool named {name!r} is registered")
        return tool


def _permitted(descriptor: AgentDescriptor) -> frozenset[str]:
    return frozenset(scope.tool_name for scope in descriptor.tool_permissions)


def _refusal(message: str) -> ToolResult:
    return ToolResult(call_id="", content=message, is_error=True)


def _render_query_result(rows: tuple[dict[str, JsonValue], ...]) -> ToolResult:
    if not rows:
        return ToolResult(call_id="", content="The query returned no rows.")
    head = rows[:MAX_QUERY_ROWS]
    body = "\n".join(str(row) for row in head)
    if len(rows) > MAX_QUERY_ROWS:
        body += (
            f"\n({len(rows) - MAX_QUERY_ROWS} more rows withheld — aggregate further.)"
        )
    return ToolResult(call_id="", content=body)
