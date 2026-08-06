from __future__ import annotations

from datetime import UTC, datetime
from uuid import UUID, uuid4

import pytest
from zentra_domain_sequence import ConnectorSourceTableReference

from zentra_application_sequence import (
    AuthenticatedActor,
    RawTableNotFoundError,
    Role,
    SequenceOrigin,
    SequenceService,
    dataset_workspace_id_for,
)

from .fakes import (
    FakeRawTableResolver,
    FakeSequenceRepository,
    FakeSequenceUnitOfWorkFactory,
)

TENANT_ID = UUID("20000000-0000-0000-0000-000000000002")
BASE = datetime(2026, 8, 1, tzinfo=UTC)


def _raw_table() -> ConnectorSourceTableReference:
    return ConnectorSourceTableReference(
        catalog_version_id="cv-1", source_table_name="clickathon.orders"
    )


def _actor() -> AuthenticatedActor:
    return AuthenticatedActor(user_id=uuid4(), organization_id=TENANT_ID, role=Role.MEMBER)


@pytest.mark.asyncio
async def test_create_persists_a_sequence_scoped_to_the_tenants_workspace() -> None:
    repository = FakeSequenceRepository()
    resolver = FakeRawTableResolver(
        {(TENANT_ID, "clickathon.orders"): "clickathon.orders"}
    )
    service = SequenceService(
        unit_of_work_factory=FakeSequenceUnitOfWorkFactory(repository),
        raw_tables=resolver,
        now=lambda: BASE,
        new_id=uuid4,
    )
    thread_id = uuid4()

    view = await service.create(
        _actor(), raw_table=_raw_table(), thread_id=thread_id
    )

    assert view.thread_id == thread_id
    assert view.origin is SequenceOrigin.MANUAL
    assert view.dataset_workspace_id == dataset_workspace_id_for(TENANT_ID)
    stored = await repository.get_sequence(
        view.sequence_id, organization_id=TENANT_ID
    )
    assert stored is not None
    assert stored.thread_id == thread_id


@pytest.mark.asyncio
async def test_create_rejects_a_raw_table_the_resolver_cannot_find() -> None:
    repository = FakeSequenceRepository()
    service = SequenceService(
        unit_of_work_factory=FakeSequenceUnitOfWorkFactory(repository),
        raw_tables=FakeRawTableResolver(),
        now=lambda: BASE,
        new_id=uuid4,
    )

    with pytest.raises(RawTableNotFoundError):
        await service.create(_actor(), raw_table=_raw_table(), thread_id=uuid4())

    assert repository.sequences == {}
