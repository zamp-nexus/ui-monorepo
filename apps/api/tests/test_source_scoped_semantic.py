from __future__ import annotations

from uuid import uuid4

import pytest
from zentra_domain_agent_execution import (
    InvalidSemanticQueryError,
    SemanticCatalog,
    SemanticDimension,
    SemanticMeasure,
    SemanticQuery,
    SemanticResult,
)

from zentra_api.source_scoped_semantic import SourceScopedSemanticLayer


class _Layer:
    def __init__(self, member: str) -> None:
        self.member = member
        self.requests: list[SemanticQuery] = []

    async def catalog(self) -> SemanticCatalog:
        return SemanticCatalog(
            measures=(SemanticMeasure(name=self.member, type="number"),),
            dimensions=(SemanticDimension(name="orders.region", type="string"),),
        )

    async def query(self, request: SemanticQuery) -> SemanticResult:
        self.requests.append(request)
        return SemanticResult(query=request, rows=({self.member: 1},))

    async def query_raw(self, request: SemanticQuery) -> SemanticResult:
        return await self.query(request)


@pytest.mark.asyncio
async def test_routes_a_qualified_query_to_its_single_source() -> None:
    first_id, second_id = uuid4(), uuid4()
    first, second = _Layer("orders.total"), _Layer("customers.count")
    layer = SourceScopedSemanticLayer({first_id: first, second_id: second})

    catalog = await layer.catalog()
    assert {measure.name for measure in catalog.measures} == {
        f"{first_id}::orders.total",
        f"{second_id}::customers.count",
    }

    result = await layer.query(
        SemanticQuery(
            source_id=first_id,
            measures=(f"{first_id}::orders.total",),
        )
    )

    assert result.rows == ({"orders.total": 1},)
    assert first.requests[0].measures == ("orders.total",)
    assert not second.requests


@pytest.mark.asyncio
async def test_refuses_members_from_another_source() -> None:
    first_id, second_id = uuid4(), uuid4()
    layer = SourceScopedSemanticLayer(
        {first_id: _Layer("orders.total"), second_id: _Layer("customers.count")}
    )

    with pytest.raises(InvalidSemanticQueryError, match="cross-source joins"):
        await layer.query(
            SemanticQuery(
                source_id=first_id,
                measures=(f"{second_id}::customers.count",),
            )
        )
