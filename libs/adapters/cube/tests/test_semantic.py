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
        if query.get("dimensions") == ["Commerce.region"] and "measures" not in query:
            # Value discovery for the catalog, not a caller's query.
            return {"data": [{"Commerce.region": "EU"}, {"Commerce.region": "NA"}]}
        return {"data": [{"Commerce.refundAmount": "260.00"}]}

    @property
    def caller_queries(self) -> list[dict[str, Any]]:
        return [query for query in self.queries if "measures" in query]


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
    # Discovered once and cached with the catalog: an agent that cannot see how
    # a value is spelled filters on "North America" and silently gets nothing.
    region = next(d for d in catalog.dimensions if d.name == "Commerce.region")
    assert region.values == ("EU", "NA")
    time_dimension = next(
        d for d in catalog.dimensions if d.name == "Commerce.orderedAt"
    )
    assert time_dimension.values == ()


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

    assert client.caller_queries == [
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

    assert client.caller_queries == []


@pytest.mark.asyncio
async def test_load_raw_bypasses_governance_and_forwards_the_query_verbatim() -> None:
    """A dimension outside the governed catalog must not be refused here.

    `load_raw` is the escape hatch a raw row-browse route uses — its whole
    point is to skip `reject_ungoverned` for a caller that already trusts its
    own dimension list.
    """
    client = StubCubeClient()
    layer = CubeSemanticLayer(client)
    query = {
        "dimensions": ["orders_raw.status"],
        "limit": 50,
        "offset": 0,
        "total": True,
    }

    await layer.load_raw(query)

    assert client.queries == [query]
