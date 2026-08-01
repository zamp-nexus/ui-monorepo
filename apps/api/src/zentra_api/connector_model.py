"""Reading a Data Connection's confirmed Join Graph as a Cube model.

This is the reimplementation of ADR-0014's governance intent — "only
permitted joins are queryable" — as compiled-schema absence rather than a
bespoke runtime gate: everything here reads only what `ConnectorService`
already exposes as confirmed, and nothing here can see a proposed or
rejected Relation.

`ConnectorService` has no production wiring yet (its four repository ports
have no adapter implementation anywhere in this repo) — this is a
pre-existing gap, unrelated to Cube, discovered while building this. Every
function here accepts `ConnectorService | None` and raises
`ConnectorNotConfiguredError` when it is absent, so a caller fails loudly
with a clear reason instead of an AttributeError deep in an unrelated
method.
"""

from __future__ import annotations

from dataclasses import dataclass
from hashlib import sha256
from uuid import UUID, uuid4

from zentra_application_connector import AuthenticatedActor, ConnectorService, Role


class ConnectorNotConfiguredError(RuntimeError):
    """Raised when a Data Connection is referenced but no ConnectorService
    is wired — see the module docstring."""


#: A read-only, tenant-scoped identity for this internal caller. Not a real
#: membership: nothing here is attributable to a person, and every method
#: touched is a read (reads are open to any role in this service; only
#: mutations gate on WRITE_ROLES).
def _system_actor(tenant_id: UUID) -> AuthenticatedActor:
    return AuthenticatedActor(user_id=uuid4(), tenant_id=tenant_id, role=Role.VIEWER)


@dataclass(frozen=True, slots=True)
class ConnectorTableModel:
    name: str
    sql_table: str
    fields: tuple[dict[str, object], ...]


@dataclass(frozen=True, slots=True)
class ConnectorJoinModel:
    from_table: str
    to_table: str
    from_field: str
    to_field: str
    relationship: str


@dataclass(frozen=True, slots=True)
class ConnectorCubeModel:
    relation_fingerprint: str
    clickhouse: dict[str, object]
    tables: tuple[ConnectorTableModel, ...]
    joins: tuple[ConnectorJoinModel, ...]


async def relation_fingerprint(
    connector: ConnectorService | None,
    *,
    tenant_id: UUID,
    data_connection_id: UUID,
) -> str:
    """A fingerprint that changes on any Relation confirm/reject/revoke.

    Confirming or rejecting a Relation mutates its state under the *same*
    CatalogVersion id, so the version id alone does not invalidate a
    compiled Cube schema. `join_graph` already returns only confirmed
    Relations (`JoinGraph.build` filters to `r.in_join_graph`), so hashing
    that set's membership is enough: any transition changes which relation
    ids appear in it.
    """
    if connector is None:
        raise ConnectorNotConfiguredError(
            "No ConnectorService is configured; cannot read a Join Graph"
        )
    actor = _system_actor(tenant_id)
    catalog = await connector.latest_catalog(actor, data_connection_id)
    graph = await connector.join_graph(actor, catalog.catalog_version_id)
    fingerprint_input = "|".join(
        sorted(f"{r.relation_id}:{r.state.value}" for r in graph.relations)
    )
    return sha256(fingerprint_input.encode()).hexdigest()


async def connector_cube_model(
    connector: ConnectorService | None,
    *,
    tenant_id: UUID,
    data_connection_id: UUID,
) -> ConnectorCubeModel:
    """Everything Cube's dynamic schema generator needs for one Data
    Connection: confirmed tables/joins and a live driver connection.

    The `clickhouse` block is the one place in this codebase plaintext
    credentials cross into a response body bound for another process — an
    accepted, scoped exception (see ADR-0016), not a silent one. Callers
    must not log this return value.
    """
    if connector is None:
        raise ConnectorNotConfiguredError(
            "No ConnectorService is configured; cannot read a Join Graph"
        )
    actor = _system_actor(tenant_id)
    catalog = await connector.latest_catalog(actor, data_connection_id)
    graph = await connector.join_graph(actor, catalog.catalog_version_id)
    credentials = await connector.resolve_driver_credentials(
        actor, data_connection_id
    )

    fields_by_table: dict[str, dict[UUID, dict[str, object]]] = {
        table.name: {
            f.field_id: {"name": f.name, "cubeType": _cube_type(f.normalised_type)}
            for f in table.fields
        }
        for table in catalog.tables
    }
    field_lookup: dict[UUID, tuple[str, str]] = {
        field_id: (table_name, cast["name"])
        for table_name, fields in fields_by_table.items()
        for field_id, cast in fields.items()
    }

    tables = tuple(
        ConnectorTableModel(
            name=table.name,
            sql_table=f"{table.database}.{table.name}",
            fields=tuple(fields_by_table[table.name].values()),
        )
        for table in catalog.tables
    )
    joins = tuple(
        ConnectorJoinModel(
            from_table=field_lookup[r.left_field_id][0],
            to_table=field_lookup[r.right_field_id][0],
            from_field=field_lookup[r.left_field_id][1],
            to_field=field_lookup[r.right_field_id][1],
            relationship=_cube_relationship(r.cardinality.value),
        )
        for r in graph.relations
        if r.left_field_id in field_lookup
        and r.right_field_id in field_lookup
        # many_to_many/unknown need a bridge or a human call this codebase's
        # domain docs say is not yet made (see Data Source CONTEXT.md) —
        # skipping is the safe default, not a silent guess.
        and r.cardinality.value not in ("many_to_many", "unknown")
    )
    fingerprint_input = "|".join(
        sorted(f"{r.relation_id}:{r.state.value}" for r in graph.relations)
    )
    return ConnectorCubeModel(
        relation_fingerprint=sha256(fingerprint_input.encode()).hexdigest(),
        clickhouse={
            "host": credentials.host,
            "port": credentials.port,
            "database": credentials.database,
            "username": credentials.username,
            "password": credentials.password,
            "secure": credentials.secure,
        },
        tables=tables,
        joins=joins,
    )


def _cube_type(data_type: str) -> str:
    """A conservative, safe-by-default mapping: unrecognized source types
    become a Cube string dimension rather than a guessed numeric one, since
    a wrong numeric cast fails loudly in Cube while a wrong string cast
    merely under-serves a filter."""
    normalized = data_type.lower()
    numeric_tokens = ("int", "float", "double", "decimal", "numeric")
    if any(token in normalized for token in numeric_tokens):
        return "number"
    if any(token in normalized for token in ("date", "time")):
        return "time"
    if "bool" in normalized:
        return "boolean"
    return "string"


def _cube_relationship(cardinality: str) -> str:
    return {
        "one_to_many": "hasMany",
        "many_to_one": "belongsTo",
        "one_to_one": "belongsTo",
    }.get(cardinality, "belongsTo")
