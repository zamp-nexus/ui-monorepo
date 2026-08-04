from __future__ import annotations

import os
from uuid import uuid4

import pytest
from zentra_application_analysis_run import (
    OrganizationNotFoundError,
    OrganizationProvisioningService,
)

from zentra_adapter_postgres import (
    Database,
    PostgresOrganizationProvisioningUnitOfWorkFactory,
)

OWNER_URL = os.getenv("TEST_DATABASE_OWNER_URL")
RUNTIME_URL = os.getenv("TEST_DATABASE_RUNTIME_URL")

pytestmark = pytest.mark.skipif(
    not OWNER_URL or not RUNTIME_URL,
    reason="local Postgres integration URLs are not configured",
)


def _service(database: Database) -> OrganizationProvisioningService:
    from datetime import UTC, datetime

    return OrganizationProvisioningService(
        unit_of_work_factory=PostgresOrganizationProvisioningUnitOfWorkFactory(
            database
        ),
        now=lambda: datetime.now(UTC),
        new_id=uuid4,
    )


@pytest.mark.asyncio
async def test_provision_organization_is_idempotent_and_binds_a_creator() -> None:
    assert RUNTIME_URL is not None
    database = Database(RUNTIME_URL)
    service = _service(database)
    external_organization_id = f"clerk-org-{uuid4()}"
    external_user_id = f"clerk-user-{uuid4()}"

    created = await service.provision_organization(
        trace_id=uuid4(),
        span_id=uuid4(),
        external_organization_id=external_organization_id,
        name="Acme Analytics",
        creator_external_user_id=external_user_id,
        creator_email="owner@acme.test",
        creator_display_name="Acme Owner",
    )
    assert created.name == "Acme Analytics"

    again = await service.provision_organization(
        trace_id=uuid4(),
        span_id=uuid4(),
        external_organization_id=external_organization_id,
        name="Acme Analytics Renamed",
    )
    assert again.organization_id == created.organization_id
    assert again.name == "Acme Analytics"

    await database.close()


@pytest.mark.asyncio
async def test_membership_lifecycle_add_update_remove() -> None:
    assert RUNTIME_URL is not None
    database = Database(RUNTIME_URL)
    service = _service(database)
    external_organization_id = f"clerk-org-{uuid4()}"
    external_user_id = f"clerk-user-{uuid4()}"

    await service.provision_organization(
        trace_id=uuid4(),
        span_id=uuid4(),
        external_organization_id=external_organization_id,
        name="Globex",
    )

    membership = await service.add_member(
        trace_id=uuid4(),
        span_id=uuid4(),
        external_organization_id=external_organization_id,
        external_user_id=external_user_id,
        email="member@globex.test",
        role="member",
    )
    assert membership.role == "member"

    updated = await service.update_member_role(
        trace_id=uuid4(),
        span_id=uuid4(),
        external_organization_id=external_organization_id,
        external_user_id=external_user_id,
        role="admin",
    )
    assert updated.role == "admin"

    await service.remove_member(
        trace_id=uuid4(),
        span_id=uuid4(),
        external_organization_id=external_organization_id,
        external_user_id=external_user_id,
    )

    with pytest.raises(OrganizationNotFoundError):
        await service.update_member_role(
            trace_id=uuid4(),
            span_id=uuid4(),
            external_organization_id=f"clerk-org-{uuid4()}",
            external_user_id=external_user_id,
            role="admin",
        )

    await database.close()


@pytest.mark.asyncio
async def test_unprovisioned_organization_lookup_returns_none() -> None:
    assert RUNTIME_URL is not None
    database = Database(RUNTIME_URL)
    async with PostgresOrganizationProvisioningUnitOfWorkFactory(database)(
        uuid4(), uuid4()
    ) as unit_of_work:
        organization_id = await unit_of_work.organizations.find_organization_id(
            "clerk", f"clerk-org-{uuid4()}"
        )
        assert organization_id is None
    await database.close()
