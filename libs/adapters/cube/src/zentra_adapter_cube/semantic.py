from __future__ import annotations

from typing import Any, Protocol

from zentra_domain_agent_execution import (
    SemanticCatalog,
    SemanticDimension,
    SemanticMeasure,
    SemanticQuery,
    SemanticResult,
)


class CubeMetaLoader(Protocol):
    async def meta(self) -> dict[str, Any]: ...

    async def load(self, query: dict[str, Any]) -> dict[str, Any]: ...


def _catalog_from_meta(meta: dict[str, Any]) -> SemanticCatalog:
    measures: list[SemanticMeasure] = []
    dimensions: list[SemanticDimension] = []
    for cube in meta.get("cubes", []):
        for measure in cube.get("measures", []):
            measures.append(
                SemanticMeasure(
                    name=measure["name"],
                    type=measure.get("type", "number"),
                    format=measure.get("format"),
                )
            )
        for dimension in cube.get("dimensions", []):
            dimensions.append(
                SemanticDimension(
                    name=dimension["name"],
                    type=dimension.get("type", "string"),
                )
            )
    return SemanticCatalog(
        measures=tuple(measures),
        dimensions=tuple(dimensions),
    )


def _to_cube_query(request: SemanticQuery) -> dict[str, Any]:
    query: dict[str, Any] = {}
    if request.measures:
        query["measures"] = list(request.measures)
    if request.dimensions:
        query["dimensions"] = list(request.dimensions)
    if request.time_dimensions:
        query["timeDimensions"] = [
            {
                key: value
                for key, value in (
                    ("dimension", time_dimension.dimension),
                    ("granularity", time_dimension.granularity),
                    (
                        "dateRange",
                        list(time_dimension.date_range)
                        if time_dimension.date_range
                        else None,
                    ),
                )
                if value is not None
            }
            for time_dimension in request.time_dimensions
        ]
    if request.filters:
        query["filters"] = [
            {
                "member": semantic_filter.member,
                "operator": semantic_filter.operator,
                "values": list(semantic_filter.values),
            }
            for semantic_filter in request.filters
        ]
    if request.limit is not None:
        query["limit"] = request.limit
    return query


class CubeSemanticLayer:
    """Reads governed metrics through Cube. Raw tables are unreachable here."""

    def __init__(self, client: CubeMetaLoader) -> None:
        self._client = client
        self._catalog: SemanticCatalog | None = None

    async def catalog(self) -> SemanticCatalog:
        if self._catalog is None:
            self._catalog = _catalog_from_meta(await self._client.meta())
        return self._catalog

    async def query(self, request: SemanticQuery) -> SemanticResult:
        catalog = await self.catalog()
        catalog.reject_ungoverned(request)
        payload = await self._client.load(_to_cube_query(request))
        return SemanticResult(
            query=request,
            rows=tuple(payload.get("data", [])),
        )
