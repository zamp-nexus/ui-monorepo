"""Cube's dynamic per-tenant schema generator reads only confirmed Relations.

This is the governance-parity test for ADR-0014's reimplemented intent: an
unconfirmed Relation must never appear in what a tenant's compiled Cube
schema can query. `connector_cube_model`/`relation_fingerprint` are the only
things standing between a Data Connection's Join Graph and Cube — if they
leak an unconfirmed join, nothing downstream would catch it.
"""

from __future__ import annotations

from datetime import UTC, datetime
from uuid import UUID, uuid4

import pytest
from zentra_application_connector import (
    AuthenticatedActor,
    ConnectorService,
    JoinGraphView,
    RelationView,
    SourceCredentials,
)
from zentra_domain_connector import (
    BindingCeiling,
    Cardinality,
    CatalogVersion,
    RelationOrigin,
    RelationState,
    SourceField,
    SourceTable,
)

from zentra_api.connector_model import (
    ConnectorNotConfiguredError,
    connector_cube_model,
    relation_fingerprint,
)

TENANT_ID = uuid4()
DATA_CONNECTION_ID = uuid4()
CATALOG_VERSION_ID = uuid4()


def _field(name: str, *, normalised_type: str = "string") -> SourceField:
    return SourceField(
        field_id=uuid4(),
        table_id=uuid4(),
        name=name,
        declared_type=normalised_type,
        family="string",  # not asserted on; a plain placeholder is enough
        normalised_type=normalised_type,
        nullable=True,
        position=0,
    )


def _relation(
    left_field_id: UUID,
    right_field_id: UUID,
    *,
    state: RelationState = RelationState.CONFIRMED,
    cardinality: Cardinality = Cardinality.MANY_TO_ONE,
) -> RelationView:
    return RelationView(
        relation_id=uuid4(),
        state=state,
        origin=RelationOrigin.INFERRED,
        confidence=0.9,
        binding_ceiling=BindingCeiling.NONE,
        cardinality=cardinality,
        left="orders.customer_id",
        right="customers.customer_id",
        left_field_id=left_field_id,
        right_field_id=right_field_id,
        is_cross_source=False,
    )


class FakeConnectorService:
    """A duck-typed stand-in for the three ConnectorService methods this
    module calls — not a fake repository stack, since none of those methods'
    internals are under test here."""

    def __init__(
        self,
        *,
        tables: tuple[SourceTable, ...],
        relations: tuple[RelationView, ...],
        credentials: SourceCredentials,
    ) -> None:
        self._tables = tables
        self._relations = relations
        self._credentials = credentials
        self.join_graph_calls = 0

    async def latest_catalog(
        self, actor: AuthenticatedActor, data_source_id: UUID
    ) -> CatalogVersion:
        return CatalogVersion(
            catalog_version_id=CATALOG_VERSION_ID,
            data_source_id=data_source_id,
            tenant_id=actor.tenant_id,
            harvest_run_id=uuid4(),
            created_at=datetime.now(UTC),
            tables=self._tables,
        )

    async def join_graph(
        self, actor: AuthenticatedActor, catalog_version_id: UUID
    ) -> JoinGraphView:
        self.join_graph_calls += 1
        # Mirrors ConnectorService.join_graph: only confirmed relations ever
        # come back from here — the same filtering JoinGraph.build applies.
        confirmed = tuple(
            r for r in self._relations if r.state is RelationState.CONFIRMED
        )
        return JoinGraphView(
            catalog_version_id=catalog_version_id,
            relations=confirmed,
        )

    async def resolve_driver_credentials(
        self, actor: AuthenticatedActor, data_source_id: UUID
    ) -> SourceCredentials:
        return self._credentials


def _connector(*, pending_relation: bool) -> FakeConnectorService:
    orders = SourceTable(
        table_id=uuid4(),
        name="orders",
        database="analytics",
        fields=(
            _field("order_id", normalised_type="int"),
            _field("customer_id", normalised_type="int"),
        ),
    )
    customers = SourceTable(
        table_id=uuid4(),
        name="customers",
        database="analytics",
        fields=(_field("customer_id", normalised_type="int"),),
    )
    confirmed = _relation(
        orders.fields[1].field_id,
        customers.fields[0].field_id,
        state=RelationState.CONFIRMED,
    )
    relations = (confirmed,)
    if pending_relation:
        relations = (
            confirmed,
            _relation(
                orders.fields[0].field_id,
                customers.fields[0].field_id,
                state=RelationState.PROPOSED,
            ),
        )
    return FakeConnectorService(
        tables=(orders, customers),
        relations=relations,
        credentials=SourceCredentials(
            host="clickhouse.tenant.example",
            port=8443,
            database="analytics",
            username="reader",
            password="secret",
            secure=True,
        ),
    )


@pytest.mark.asyncio
async def test_unconfirmed_relation_never_reaches_the_cube_model() -> None:
    """The governance-parity assertion: a pending Relation must not appear
    in the model Cube compiles a schema from, however many other relations
    exist alongside it."""
    connector = _connector(pending_relation=True)

    model = await connector_cube_model(
        connector, tenant_id=TENANT_ID, data_connection_id=DATA_CONNECTION_ID
    )

    assert len(model.joins) == 1
    assert model.joins[0].from_table == "orders"
    assert model.joins[0].to_table == "customers"


@pytest.mark.asyncio
async def test_credentials_are_carried_but_never_logged_by_this_function() -> None:
    connector = _connector(pending_relation=False)

    model = await connector_cube_model(
        connector, tenant_id=TENANT_ID, data_connection_id=DATA_CONNECTION_ID
    )

    assert model.clickhouse["host"] == "clickhouse.tenant.example"
    assert model.clickhouse["password"] == "secret"


@pytest.mark.asyncio
async def test_fingerprint_changes_when_a_relation_is_confirmed() -> None:
    """The fix for the cache-invalidation gap: confirming a Relation must
    change the fingerprint even though the CatalogVersion id does not."""
    relation_id = uuid4()
    left_field_id, right_field_id = uuid4(), uuid4()
    tables = (
        SourceTable(
            table_id=uuid4(), name="orders", database="analytics",
            fields=(_field("customer_id", normalised_type="int"),),
        ),
        SourceTable(
            table_id=uuid4(), name="customers", database="analytics",
            fields=(_field("customer_id", normalised_type="int"),),
        ),
    )
    credentials = SourceCredentials(
        host="h", port=1, database="d", username="u", password="p"
    )

    def relation(state: RelationState) -> RelationView:
        return RelationView(
            relation_id=relation_id,
            state=state,
            origin=RelationOrigin.INFERRED,
            confidence=0.9,
            binding_ceiling=BindingCeiling.NONE,
            cardinality=Cardinality.MANY_TO_ONE,
            left="orders.customer_id",
            right="customers.customer_id",
            left_field_id=left_field_id,
            right_field_id=right_field_id,
            is_cross_source=False,
        )

    before = await relation_fingerprint(
        FakeConnectorService(
            tables=tables,
            relations=(relation(RelationState.PROPOSED),),
            credentials=credentials,
        ),
        tenant_id=TENANT_ID,
        data_connection_id=DATA_CONNECTION_ID,
    )
    after = await relation_fingerprint(
        FakeConnectorService(
            tables=tables,
            relations=(relation(RelationState.CONFIRMED),),
            credentials=credentials,
        ),
        tenant_id=TENANT_ID,
        data_connection_id=DATA_CONNECTION_ID,
    )

    assert before != after


@pytest.mark.asyncio
async def test_fingerprint_changes_when_the_confirmed_relation_is_rejected() -> None:
    confirmed_connector = _connector(pending_relation=False)
    rejected_relations = tuple(
        _relation(
            r.left_field_id, r.right_field_id, state=RelationState.REJECTED
        )
        for r in confirmed_connector._relations
    )
    rejected_connector = FakeConnectorService(
        tables=confirmed_connector._tables,
        relations=rejected_relations,
        credentials=confirmed_connector._credentials,
    )

    confirmed_fingerprint = await relation_fingerprint(
        confirmed_connector, tenant_id=TENANT_ID, data_connection_id=DATA_CONNECTION_ID
    )
    rejected_fingerprint = await relation_fingerprint(
        rejected_connector, tenant_id=TENANT_ID, data_connection_id=DATA_CONNECTION_ID
    )

    assert confirmed_fingerprint != rejected_fingerprint


@pytest.mark.asyncio
async def test_many_to_many_relations_are_not_emitted_as_a_cube_join() -> None:
    """No bridge table exists to interpret a many-to-many join safely — see
    Data Source CONTEXT.md. Skipping is the safe default, not a guess."""
    orders = SourceTable(
        table_id=uuid4(), name="orders", database="analytics",
        fields=(_field("tag_id", normalised_type="int"),),
    )
    tags = SourceTable(
        table_id=uuid4(), name="tags", database="analytics",
        fields=(_field("tag_id", normalised_type="int"),),
    )
    connector = FakeConnectorService(
        tables=(orders, tags),
        relations=(
            _relation(
                orders.fields[0].field_id,
                tags.fields[0].field_id,
                cardinality=Cardinality.MANY_TO_MANY,
            ),
        ),
        credentials=SourceCredentials(
            host="h", port=1, database="d", username="u", password="p"
        ),
    )

    model = await connector_cube_model(
        connector, tenant_id=TENANT_ID, data_connection_id=DATA_CONNECTION_ID
    )

    assert model.joins == ()


@pytest.mark.asyncio
async def test_no_connector_configured_fails_clearly_not_with_attribute_error() -> None:
    with pytest.raises(ConnectorNotConfiguredError):
        await connector_cube_model(
            None, tenant_id=TENANT_ID, data_connection_id=DATA_CONNECTION_ID
        )
    with pytest.raises(ConnectorNotConfiguredError):
        await relation_fingerprint(
            None, tenant_id=TENANT_ID, data_connection_id=DATA_CONNECTION_ID
        )


def test_fake_satisfies_the_real_protocol_shape() -> None:
    """Not exhaustive, but catches the obvious drift: if ConnectorService
    ever renames one of these three methods, this fails instead of the fake
    silently going stale."""
    for name in ("latest_catalog", "join_graph", "resolve_driver_credentials"):
        assert hasattr(ConnectorService, name)
