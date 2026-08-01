from __future__ import annotations

from datetime import UTC, datetime, timedelta
from uuid import UUID, uuid4

import pytest
from zentra_domain_sequence import ConnectorSourceTableReference, Sequence

from zentra_application_sequence import (
    AuthenticatedActor,
    PreparedTableNotFoundError,
    Role,
    SequenceNotFoundError,
    SequenceService,
    dataset_workspace_id_for,
)

from .fakes import (
    FakeRawTableResolver,
    FakeSequenceRepository,
    FakeSequenceUnitOfWorkFactory,
)

TENANT_ID = UUID("20000000-0000-0000-0000-000000000002")
OTHER_TENANT_ID = UUID("20000000-0000-0000-0000-000000000009")
BASE = datetime(2026, 8, 1, tzinfo=UTC)


def _raw_table() -> ConnectorSourceTableReference:
    return ConnectorSourceTableReference(
        catalog_version_id="cv-1", source_table_name="clickathon.orders"
    )


def _service(repository: FakeSequenceRepository) -> SequenceService:
    return SequenceService(
        unit_of_work_factory=FakeSequenceUnitOfWorkFactory(repository),
        raw_tables=FakeRawTableResolver(),
        now=lambda: BASE,
        new_id=uuid4,
    )


def _actor(tenant_id: UUID = TENANT_ID) -> AuthenticatedActor:
    return AuthenticatedActor(user_id=uuid4(), tenant_id=tenant_id, role=Role.MEMBER)


@pytest.mark.asyncio
async def test_list_returns_only_this_tenants_workspace_sequences() -> None:
    repository = FakeSequenceRepository()
    mine = Sequence.create(
        sequence_id=uuid4(),
        tenant_id=TENANT_ID,
        dataset_workspace_id=dataset_workspace_id_for(TENANT_ID),
        raw_table_reference=_raw_table(),
        now=BASE,
    )
    someone_elses = Sequence.create(
        sequence_id=uuid4(),
        tenant_id=OTHER_TENANT_ID,
        dataset_workspace_id=dataset_workspace_id_for(OTHER_TENANT_ID),
        raw_table_reference=_raw_table(),
        now=BASE,
    )
    await repository.add_sequence(mine)
    await repository.add_sequence(someone_elses)

    result = await _service(repository).list(_actor())

    assert result.dataset_workspace_id == dataset_workspace_id_for(TENANT_ID)
    assert [item.sequence_id for item in result.items] == [mine.sequence_id]


@pytest.mark.asyncio
async def test_list_orders_most_recently_active_first() -> None:
    repository = FakeSequenceRepository()
    older = Sequence.create(
        sequence_id=uuid4(),
        tenant_id=TENANT_ID,
        dataset_workspace_id=dataset_workspace_id_for(TENANT_ID),
        raw_table_reference=_raw_table(),
        now=BASE,
    )
    newer = Sequence.create(
        sequence_id=uuid4(),
        tenant_id=TENANT_ID,
        dataset_workspace_id=dataset_workspace_id_for(TENANT_ID),
        raw_table_reference=_raw_table(),
        now=BASE + timedelta(hours=1),
    )
    await repository.add_sequence(older)
    await repository.add_sequence(newer)

    result = await _service(repository).list(_actor())

    assert [item.sequence_id for item in result.items] == [
        newer.sequence_id,
        older.sequence_id,
    ]


@pytest.mark.asyncio
async def test_get_returns_the_full_graph_for_an_owned_sequence() -> None:
    repository = FakeSequenceRepository()
    sequence = Sequence.create(
        sequence_id=uuid4(),
        tenant_id=TENANT_ID,
        dataset_workspace_id=dataset_workspace_id_for(TENANT_ID),
        raw_table_reference=_raw_table(),
        now=BASE,
    )
    await repository.add_sequence(sequence)

    view = await _service(repository).get(_actor(), sequence.sequence_id)

    assert view.sequence_id == sequence.sequence_id
    assert view.raw_table_label == "clickathon.orders"


@pytest.mark.asyncio
async def test_get_refuses_a_sequence_belonging_to_another_tenant() -> None:
    repository = FakeSequenceRepository()
    sequence = Sequence.create(
        sequence_id=uuid4(),
        tenant_id=OTHER_TENANT_ID,
        dataset_workspace_id=dataset_workspace_id_for(OTHER_TENANT_ID),
        raw_table_reference=_raw_table(),
        now=BASE,
    )
    await repository.add_sequence(sequence)

    with pytest.raises(SequenceNotFoundError):
        await _service(repository).get(_actor(), sequence.sequence_id)


@pytest.mark.asyncio
async def test_get_raises_for_an_unknown_sequence() -> None:
    with pytest.raises(SequenceNotFoundError):
        await _service(FakeSequenceRepository()).get(_actor(), uuid4())


@pytest.mark.asyncio
async def test_preview_raises_for_an_unknown_prepared_table() -> None:
    repository = FakeSequenceRepository()
    sequence = Sequence.create(
        sequence_id=uuid4(),
        tenant_id=TENANT_ID,
        dataset_workspace_id=dataset_workspace_id_for(TENANT_ID),
        raw_table_reference=_raw_table(),
        now=BASE,
    )
    await repository.add_sequence(sequence)

    with pytest.raises(PreparedTableNotFoundError):
        await _service(repository).preview_prepared_table(
            _actor(), sequence.sequence_id, uuid4()
        )
