"""A Chat-wide semantic layer composed from independent Data Sources.

This is intentionally not a federated query engine.  It exposes several
source-local catalogs to an Agent, then routes each governed query to exactly
one of them.  The Agent may compare the returned aggregates in its narrative,
but no SQL, rows, or joins cross a source boundary.
"""

from __future__ import annotations

from collections.abc import Awaitable, Mapping
from uuid import UUID

from zentra_domain_agent_execution import (
    InvalidSemanticQueryError,
    SemanticCatalog,
    SemanticDimension,
    SemanticLayerPort,
    SemanticMeasure,
    SemanticQuery,
    SemanticResult,
)


def _qualified(source_id: UUID, member: str) -> str:
    return f"{source_id}::{member}"


class SourceScopedSemanticLayer:
    """Routes an explicitly source-qualified semantic query to one layer."""

    def __init__(self, layers: Mapping[UUID, SemanticLayerPort]) -> None:
        self._layers = dict(layers)
        self._catalog: SemanticCatalog | None = None

    async def catalog(self) -> SemanticCatalog:
        if self._catalog is not None:
            return self._catalog
        catalogs = await _gather_catalogs(self._layers)
        measures: list[SemanticMeasure] = []
        dimensions: list[SemanticDimension] = []
        for source_id, catalog in catalogs.items():
            source_label = str(source_id)
            measures.extend(
                measure.model_copy(
                    update={
                        "name": _qualified(source_id, measure.name),
                        "description": _with_source(measure.description, source_label),
                    }
                )
                for measure in catalog.measures
            )
            dimensions.extend(
                dimension.model_copy(
                    update={
                        "name": _qualified(source_id, dimension.name),
                        "description": _with_source(dimension.description, source_label),
                    }
                )
                for dimension in catalog.dimensions
            )
        self._catalog = SemanticCatalog(
            measures=tuple(measures), dimensions=tuple(dimensions)
        )
        return self._catalog

    async def query(self, request: SemanticQuery) -> SemanticResult:
        layer, local_request = await self._local_request(request)
        result = await layer.query(local_request)
        return result.model_copy(update={"query": request})

    async def query_raw(self, request: SemanticQuery) -> SemanticResult:
        layer, local_request = await self._local_request(request)
        result = await layer.query_raw(local_request)
        return result.model_copy(update={"query": request})

    async def _local_request(
        self, request: SemanticQuery
    ) -> tuple[SemanticLayerPort, SemanticQuery]:
        source_id = request.source_id
        if source_id is None:
            raise InvalidSemanticQueryError(
                "Choose a source_id. A multi-source Chat cannot infer one."
            )
        layer = self._layers.get(source_id)
        if layer is None:
            raise InvalidSemanticQueryError("The requested source is not in this Chat.")
        return layer, request.model_copy(
            update={
                "measures": _local_members(source_id, request.measures),
                "dimensions": _local_members(source_id, request.dimensions),
                "time_dimensions": tuple(
                    item.model_copy(
                        update={"dimension": _local_member(source_id, item.dimension)}
                    )
                    for item in request.time_dimensions
                ),
                "filters": tuple(
                    item.model_copy(
                        update={"member": _local_member(source_id, item.member)}
                    )
                    for item in request.filters
                ),
            }
        )


async def _gather_catalogs(
    layers: Mapping[UUID, SemanticLayerPort],
) -> dict[UUID, SemanticCatalog]:
    return {source_id: await layer.catalog() for source_id, layer in layers.items()}


def _with_source(description: str | None, source_label: str) -> str:
    prefix = f"Source {source_label}."
    return f"{prefix} {description}" if description else prefix


def _local_members(source_id: UUID, members: tuple[str, ...]) -> tuple[str, ...]:
    return tuple(_local_member(source_id, member) for member in members)


def _local_member(source_id: UUID, member: str) -> str:
    prefix = f"{source_id}::"
    if not member.startswith(prefix):
        raise InvalidSemanticQueryError(
            "All query members must belong to the selected source_id; "
            "cross-source joins are not supported."
        )
    return member.removeprefix(prefix)
