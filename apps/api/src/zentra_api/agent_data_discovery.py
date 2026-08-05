"""Tenant-safe connector metadata for the agent data-discovery tools.

This adapter owns the translation from Connector read models to compact prompt
payloads. It deliberately never exposes a source credential, stored sample
values, or unconfirmed relations.
"""

from __future__ import annotations

import asyncio
from collections.abc import Callable
from copy import deepcopy
from dataclasses import dataclass
from uuid import UUID

from pydantic.types import JsonValue
from zentra_application_connector import (
    AuthenticatedActor,
    CatalogVersionNotFoundError,
    ConnectorService,
    JoinGraphView,
    Role,
)
from zentra_domain_connector import CatalogVersion, FieldProfile


@dataclass(frozen=True, slots=True)
class DiscoveryRunMetrics:
    """Safe, aggregate counts for one immutable discovery snapshot."""

    inventory_cache_hits: int
    schema_snapshot_reuses: int


class ConnectorDataDiscovery:
    """One run's immutable view of agent-visible connection metadata."""

    def __init__(self, connector: Callable[[], ConnectorService | None]) -> None:
        self._connector = connector
        self._inventory: dict[UUID, dict[str, JsonValue]] = {}
        self._inventory_tasks: dict[UUID, asyncio.Task[dict[str, JsonValue]]] = {}
        self._catalogs: dict[tuple[UUID, UUID], CatalogVersion] = {}
        self._graphs: dict[tuple[UUID, UUID], JoinGraphView] = {}
        self._inventory_cache_hits = 0
        self._schema_snapshot_reuses = 0

    async def connection_inventory(self, organization_id: UUID) -> dict[str, JsonValue]:
        cached = self._inventory.get(organization_id)
        if cached is not None:
            self._inventory_cache_hits += 1
            return deepcopy(cached)
        task = self._inventory_tasks.get(organization_id)
        if task is not None:
            self._inventory_cache_hits += 1
            return deepcopy(await asyncio.shield(task))
        task = asyncio.create_task(self._load_inventory(organization_id))
        self._inventory_tasks[organization_id] = task
        task.add_done_callback(
            lambda finished: self._discard_inventory_task(organization_id, finished)
        )
        return deepcopy(await asyncio.shield(task))

    def _discard_inventory_task(
        self, organization_id: UUID, task: asyncio.Task[dict[str, JsonValue]]
    ) -> None:
        if self._inventory_tasks.get(organization_id) is task:
            self._inventory_tasks.pop(organization_id, None)

    async def _load_inventory(self, organization_id: UUID) -> dict[str, JsonValue]:
        connector = self._require_connector()
        actor = _agent_actor(organization_id)
        connections: list[dict[str, JsonValue]] = []
        for source in await connector.list_sources(actor):
            catalog_available = False
            table_count = 0
            join_count = 0
            if source.health.value == "reachable":
                try:
                    catalog = await connector.agent_visible_catalog(
                        actor, source.data_source_id
                    )
                    graph = await connector.join_graph(
                        actor, catalog.catalog_version_id
                    )
                    self._catalogs[(organization_id, source.data_source_id)] = catalog
                    self._graphs[(organization_id, source.data_source_id)] = graph
                    catalog_available = True
                    table_count = len(catalog.tables)
                    join_count = len(graph.relations)
                except CatalogVersionNotFoundError:
                    pass
            connections.append(
                {
                    "connection_id": str(source.data_source_id),
                    "name": source.name,
                    "kind": source.kind.value,
                    "readiness": source.health.value,
                    "catalog_available": catalog_available,
                    "table_count": table_count,
                    "confirmed_join_count": join_count,
                }
            )
        result: dict[str, JsonValue] = {
            "connection_count": len(connections),
            "connections": connections,
        }
        self._inventory[organization_id] = deepcopy(result)
        return result

    async def schema_inspect(
        self, organization_id: UUID, connection_id: UUID, table_name: str | None
    ) -> dict[str, JsonValue]:
        await self.connection_inventory(organization_id)
        catalog = self._catalogs.get((organization_id, connection_id))
        graph = self._graphs.get((organization_id, connection_id))
        if catalog is None or graph is None:
            raise LookupError("Connection is not ready or has no harvested catalog")
        self._schema_snapshot_reuses += 1
        tables = catalog.tables
        if table_name is None:
            return {
                "connection_id": str(connection_id),
                "tables": [
                    {
                        "name": table.name,
                        "query_dataset": f"{connection_id}::{table.name}",
                        "database": table.database,
                        "field_count": len(table.fields),
                        "estimated_rows": table.estimated_rows,
                    }
                    for table in tables
                ],
            }
        table = next((item for item in tables if item.name == table_name), None)
        if table is None:
            raise LookupError(
                f"No agent-visible table named {table_name!r} in this connection"
            )
        joins = [
            {
                "left": relation.left,
                "right": relation.right,
                "cardinality": relation.cardinality.value,
            }
            for relation in graph.relations
            if relation.left.startswith(f"{table.name}.")
            or relation.right.startswith(f"{table.name}.")
        ]
        return {
            "connection_id": str(connection_id),
            "table": {
                "name": table.name,
                "database": table.database,
                "fields": [
                    {
                        "name": field.name,
                        "query_member": f"{connection_id}::{table.name}.{field.name}",
                        "declared_type": field.declared_type,
                        "family": field.family.value,
                        "nullable": field.nullable,
                        "position": field.position,
                        "profile": _profile(field.profile),
                    }
                    for field in sorted(table.fields, key=lambda field: field.position)
                ],
                "confirmed_joins": joins,
            },
        }

    def _require_connector(self) -> ConnectorService:
        connector = self._connector()
        if connector is None:
            raise LookupError(
                "Connection discovery is unavailable until Connector is configured"
            )
        return connector

    @property
    def metrics(self) -> DiscoveryRunMetrics:
        return DiscoveryRunMetrics(
            inventory_cache_hits=self._inventory_cache_hits,
            schema_snapshot_reuses=self._schema_snapshot_reuses,
        )


def _agent_actor(organization_id: UUID) -> AuthenticatedActor:
    return AuthenticatedActor(
        user_id=UUID(int=0), organization_id=organization_id, role=Role.MEMBER
    )


def _profile(profile: FieldProfile | None) -> dict[str, JsonValue] | None:
    if profile is None:
        return None
    return {
        "sampled_rows": profile.sampled_rows,
        "null_fraction": profile.null_fraction,
        "distinct_count": profile.distinct_count,
        "min_value": profile.min_value,
        "max_value": profile.max_value,
    }
