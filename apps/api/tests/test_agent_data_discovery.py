from __future__ import annotations

from types import SimpleNamespace
from uuid import UUID

import pytest

from zentra_api.agent_data_discovery import ConnectorDataDiscovery

TENANT_ID = UUID("22000000-0000-0000-0000-000000000002")
CONNECTION_ID = UUID("44000000-0000-0000-0000-000000000004")


class Connector:
    def __init__(self) -> None:
        profile = SimpleNamespace(
            sampled_rows=20,
            null_fraction=0.1,
            distinct_count=18,
            min_value="1",
            max_value="20",
            sample_values=("secret",),
        )
        field = SimpleNamespace(
            name="customer_id",
            declared_type="UInt64",
            family=SimpleNamespace(value="integer"),
            nullable=False,
            position=0,
            profile=profile,
        )
        table = SimpleNamespace(
            name="orders",
            database="analytics",
            fields=(field,),
            estimated_rows=20,
        )
        self._catalog = SimpleNamespace(catalog_version_id=UUID(int=8), tables=(table,))

    async def list_sources(self, actor):
        assert actor.organization_id == TENANT_ID
        return (
            SimpleNamespace(
                data_source_id=CONNECTION_ID,
                name="Warehouse",
                kind=SimpleNamespace(value="connected"),
                health=SimpleNamespace(value="reachable"),
                password="never exposed",
            ),
        )

    async def agent_visible_catalog(self, actor, connection_id):
        assert connection_id == CONNECTION_ID
        return self._catalog

    async def join_graph(self, actor, catalog_version_id):
        return SimpleNamespace(
            relations=(
                SimpleNamespace(
                    left="orders.customer_id",
                    right="customers.id",
                    cardinality=SimpleNamespace(value="many_to_one"),
                ),
            )
        )


@pytest.mark.asyncio
async def test_inventory_and_schema_are_safe_and_cached_per_run() -> None:
    discovery = ConnectorDataDiscovery(lambda: Connector())

    inventory = await discovery.connection_inventory(TENANT_ID)
    schema = await discovery.schema_inspect(TENANT_ID, CONNECTION_ID, "orders")

    assert inventory["connection_count"] == 1
    assert inventory["connections"][0]["name"] == "Warehouse"
    assert "password" not in str(inventory)
    assert schema["table"]["fields"][0]["query_member"] == (
        f"{CONNECTION_ID}::orders.customer_id"
    )
    assert "sample_values" not in str(schema)
    assert schema["table"]["confirmed_joins"] == [
        {
            "left": "orders.customer_id",
            "right": "customers.id",
            "cardinality": "many_to_one",
        }
    ]
