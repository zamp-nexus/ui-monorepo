from __future__ import annotations

from uuid import UUID

import pytest
from zentra_domain_agent_execution import (
    SemanticCatalog,
    SemanticMeasure,
    SemanticQuery,
    SemanticResult,
)

from zentra_adapter_langgraph.tools import (
    ConnectionInventoryTool,
    DataQueryTool,
    SchemaInspectTool,
    data_discovery_tools,
)

TENANT_ID = UUID("22000000-0000-0000-0000-000000000002")
CONNECTION_ID = UUID("44000000-0000-0000-0000-000000000004")


class Discovery:
    async def connection_inventory(self, organization_id: UUID):
        assert organization_id == TENANT_ID
        return {
            "connection_count": 1,
            "connections": [{"connection_id": str(CONNECTION_ID)}],
        }

    async def schema_inspect(
        self, organization_id: UUID, connection_id: UUID, table_name: str | None
    ):
        assert organization_id == TENANT_ID
        assert connection_id == CONNECTION_ID
        return {"table": {"name": table_name}}


class SemanticLayer:
    async def catalog(self) -> SemanticCatalog:
        return SemanticCatalog(
            measures=(
                SemanticMeasure(
                    name=f"{CONNECTION_ID}::Orders.count", type="number"
                ),
            ),
            dimensions=(),
        )

    async def query(self, request: SemanticQuery) -> SemanticResult:
        raise AssertionError("data_query must use the raw structured path")

    async def query_raw(self, request: SemanticQuery) -> SemanticResult:
        return SemanticResult(query=request, rows=({"count": 1},))


@pytest.mark.asyncio
async def test_discovery_tools_return_inventory_and_selected_schema() -> None:
    discovery = Discovery()

    inventory = await ConnectionInventoryTool(discovery, TENANT_ID).invoke({})
    schema = await SchemaInspectTool(discovery, TENANT_ID).invoke(
        {"connection_id": str(CONNECTION_ID), "table_name": "orders"}
    )

    assert "connection_count" in inventory.content
    assert "orders" in schema.content


def test_schema_inspect_allows_a_connection_overview_without_table_name() -> None:
    definition = SchemaInspectTool(Discovery(), TENANT_ID).definition

    assert definition.input_schema["required"] == ["connection_id"]


def test_discovery_tool_builder_keeps_all_three_tools_when_unavailable() -> None:
    tools = data_discovery_tools(
        semantic_layer=SemanticLayer(), discovery=None, organization_id=TENANT_ID
    )

    assert tuple(tool.name for tool in tools) == (
        "connection_inventory",
        "schema_inspect",
        "data_query",
    )


@pytest.mark.asyncio
async def test_data_query_requires_a_selected_source_and_uses_raw_path() -> None:
    tool = DataQueryTool(SemanticLayer())
    rejected = await tool.invoke(
        {
            "source_id": None,
            "measures": [],
            "dimensions": [],
            "time_dimensions": [],
            "filters": [],
        }
    )
    result = await tool.invoke(
        {
            "source_id": str(CONNECTION_ID),
            "measures": [f"{CONNECTION_ID}::Orders.count"],
            "dimensions": [],
            "time_dimensions": [],
            "filters": [],
        }
    )

    assert rejected.is_error
    assert "source_id is required" in rejected.content
    assert result.content == "{'count': 1}"


@pytest.mark.asyncio
async def test_data_query_rejects_foreign_and_cross_source_members() -> None:
    tool = DataQueryTool(SemanticLayer())
    foreign_source = UUID("55000000-0000-0000-0000-000000000005")

    foreign = await tool.invoke(
        {
            "source_id": str(foreign_source),
            "measures": [f"{foreign_source}::Orders.count"],
            "dimensions": [],
            "time_dimensions": [],
            "filters": [],
        }
    )
    mixed = await tool.invoke(
        {
            "source_id": str(CONNECTION_ID),
            "measures": [f"{foreign_source}::Orders.count"],
            "dimensions": [],
            "time_dimensions": [],
            "filters": [],
        }
    )

    assert foreign.is_error
    assert "not available" in foreign.content
    assert mixed.is_error
    assert "cross-source" in mixed.content
