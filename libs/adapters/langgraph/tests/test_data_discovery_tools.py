from __future__ import annotations

from uuid import UUID

import pytest
from zentra_domain_agent_execution import SemanticCatalog, SemanticQuery, SemanticResult

from zentra_adapter_langgraph.tools import (
    ConnectionInventoryTool,
    DataQueryTool,
    SchemaInspectTool,
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
        return SemanticCatalog(measures=(), dimensions=())

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
