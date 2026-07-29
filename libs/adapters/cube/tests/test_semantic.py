from __future__ import annotations

from typing import Any

import pytest
from zentra_domain_agent_execution import (
    SemanticFilter,
    SemanticQuery,
    SemanticTimeDimension,
    UnknownSemanticMemberError,
)

from zentra_adapter_cube import CubeSemanticLayer

META = {
    "cubes": [
        {
            "name": "Commerce",
            "measures": [
                {"name": "Commerce.refundAmount", "type": "sum", "format": "currency"},
                {"name": "Commerce.orderCount", "type": "countDistinct"},
            ],
            "dimensions": [
                {"name": "Commerce.orderedAt", "type": "time"},
                {"name": "Commerce.region", "type": "string"},
            ],
        }
    ]
}


class StubCubeClient:
    def __init__(self) -> None:
        self.meta_calls = 0
        self.queries: list[dict[str, Any]] = []

    async def meta(self) -> dict[str, Any]:
        self.meta_calls += 1
        return META

    async def load(self, query: dict[str, Any]) -> dict[str, Any]:
        self.queries.append(query)
        return {"data": [{"Commerce.refundAmount": "260.00"}]}


@pytest.mark.asyncio
async def test_catalog_exposes_governed_members_and_is_cached() -> None:
    client = StubCubeClient()
    layer = CubeSemanticLayer(client)

    catalog = await layer.catalog()
    await layer.catalog()

    assert client.meta_calls == 1
    assert catalog.member_names() == {
        "Commerce.refundAmount",
        "Commerce.orderCount",
        "Commerce.orderedAt",
        "Commerce.region",
    }


@pytest.mark.asyncio
async def test_query_is_translated_to_the_cube_payload() -> None:
    client = StubCubeClient()
    layer = CubeSemanticLayer(client)

    result = await layer.query(
        SemanticQuery(
            measures=("Commerce.refundAmount",),
            time_dimensions=(
                SemanticTimeDimension(
                    dimension="Commerce.orderedAt",
                    granularity="month",
                    date_range=("2026-06-01", "2026-07-31"),
                ),
            ),
            filters=(
                SemanticFilter(
                    member="Commerce.region",
                    operator="equals",
                    values=("EU",),
                ),
            ),
        )
    )

    assert client.queries == [
        {
            "measures": ["Commerce.refundAmount"],
            "timeDimensions": [
                {
                    "dimension": "Commerce.orderedAt",
                    "granularity": "month",
                    "dateRange": ["2026-06-01", "2026-07-31"],
                }
            ],
            "filters": [
                {
                    "member": "Commerce.region",
                    "operator": "equals",
                    "values": ["EU"],
                }
            ],
        }
    ]
    assert result.rows == ({"Commerce.refundAmount": "260.00"},)


@pytest.mark.asyncio
async def test_ungoverned_member_is_refused_before_any_query_runs() -> None:
    client = StubCubeClient()
    layer = CubeSemanticLayer(client)

    with pytest.raises(UnknownSemanticMemberError, match="commerce_facts.margin"):
        await layer.query(SemanticQuery(measures=("commerce_facts.margin",)))

    assert client.queries == []
