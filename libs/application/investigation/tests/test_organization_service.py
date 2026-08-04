from __future__ import annotations

from contextlib import AbstractAsyncContextManager
from datetime import UTC, datetime
from itertools import count
from uuid import UUID

import pytest

from zentra_application_investigation import (
    MembershipDetail,
    OrganizationDetail,
    OrganizationNotFoundError,
    OrganizationProvisioningService,
)

NOW = datetime(2026, 8, 1, tzinfo=UTC)


class Repository:
    def __init__(self) -> None:
        self.organizations: dict[UUID, OrganizationDetail] = {}
        self.bindings: dict[tuple[str, str], UUID] = {}
        self.identities: dict[tuple[str, str], UUID] = {}
        self.memberships: dict[tuple[UUID, UUID], MembershipDetail] = {}

    async def find_organization_id(
        self, provider: str, external_organization_id: str
    ) -> UUID | None:
        return self.bindings.get((provider, external_organization_id))

    async def get_organization(
        self, organization_id: UUID
    ) -> OrganizationDetail | None:
        return self.organizations.get(organization_id)

    async def add_organization(
        self, organization_id: UUID, *, name: str, created_at: datetime
    ) -> None:
        self.organizations[organization_id] = OrganizationDetail(
            organization_id=organization_id, name=name, created_at=created_at
        )

    async def add_organization_binding(
        self,
        provider: str,
        external_organization_id: str,
        *,
        organization_id: UUID,
    ) -> None:
        self.bindings[(provider, external_organization_id)] = organization_id

    async def upsert_identity(
        self,
        provider: str,
        external_subject_id: str,
        *,
        email: str,
        display_name: str | None,
        new_user_id: UUID,
        created_at: datetime,
    ) -> UUID:
        key = (provider, external_subject_id)
        existing = self.identities.get(key)
        if existing is not None:
            return existing
        self.identities[key] = new_user_id
        return new_user_id

    async def find_user_id(
        self, provider: str, external_subject_id: str
    ) -> UUID | None:
        return self.identities.get((provider, external_subject_id))

    async def add_membership(
        self,
        organization_id: UUID,
        user_id: UUID,
        *,
        role: str,
        created_at: datetime,
    ) -> None:
        self.memberships[(organization_id, user_id)] = MembershipDetail(
            organization_id=organization_id,
            user_id=user_id,
            role=role,
            created_at=created_at,
        )

    async def get_membership(
        self, organization_id: UUID, user_id: UUID
    ) -> MembershipDetail | None:
        return self.memberships.get((organization_id, user_id))

    async def save_membership_role(
        self, organization_id: UUID, user_id: UUID, *, role: str
    ) -> None:
        existing = self.memberships[(organization_id, user_id)]
        self.memberships[(organization_id, user_id)] = MembershipDetail(
            organization_id=existing.organization_id,
            user_id=existing.user_id,
            role=role,
            created_at=existing.created_at,
        )

    async def remove_membership(self, organization_id: UUID, user_id: UUID) -> None:
        self.memberships.pop((organization_id, user_id), None)


class UnitOfWork:
    def __init__(self, repository: Repository) -> None:
        self.organizations = repository
        self.committed = False

    async def __aenter__(self) -> UnitOfWork:
        return self

    async def __aexit__(self, *args: object) -> None:
        return None

    async def commit(self) -> None:
        self.committed = True


class UnitOfWorkFactory:
    def __init__(self, repository: Repository) -> None:
        self.repository = repository

    def __call__(
        self, trace_id: UUID, span_id: UUID
    ) -> AbstractAsyncContextManager[UnitOfWork]:
        return UnitOfWork(self.repository)


def deterministic_ids() -> tuple[list[UUID], object]:
    """Return (list of ids issued so far, a `new_id` callable) for exact assertions."""
    issued: list[UUID] = []
    counter = count(1)

    def new_id() -> UUID:
        value = UUID(int=next(counter))
        issued.append(value)
        return value

    return issued, new_id


def service(
    repository: Repository | None = None,
) -> tuple[OrganizationProvisioningService, Repository, list[UUID]]:
    repository = repository or Repository()
    issued, new_id = deterministic_ids()
    provisioning = OrganizationProvisioningService(
        unit_of_work_factory=UnitOfWorkFactory(repository),
        now=lambda: NOW,
        new_id=new_id,
    )
    return provisioning, repository, issued


@pytest.mark.asyncio
async def test_provision_organization_is_idempotent() -> None:
    provisioning, _repository, _issued = service()

    first = await provisioning.provision_organization(
        trace_id=UUID(int=100),
        span_id=UUID(int=101),
        external_organization_id="org_ext_1",
        name="Acme",
    )
    second = await provisioning.provision_organization(
        trace_id=UUID(int=100),
        span_id=UUID(int=101),
        external_organization_id="org_ext_1",
        name="Acme",
    )

    assert first == second
    assert first.organization_id == second.organization_id
    assert first == OrganizationDetail(
        organization_id=first.organization_id, name="Acme", created_at=NOW
    )
    assert _repository.organizations == {first.organization_id: first}
    assert _repository.bindings == {("clerk", "org_ext_1"): first.organization_id}


@pytest.mark.asyncio
async def test_provision_organization_with_creator_creates_owner_membership() -> None:
    provisioning, repository, issued = service()

    detail = await provisioning.provision_organization(
        trace_id=UUID(int=100),
        span_id=UUID(int=101),
        external_organization_id="org_ext_1",
        name="Acme",
        creator_external_user_id="user_ext_1",
        creator_email="owner@acme.test",
        creator_display_name="Owner Person",
    )

    # issued: organization_id, then user_id
    assert issued == [detail.organization_id, UUID(int=2)]
    user_id = UUID(int=2)
    membership = repository.memberships[(detail.organization_id, user_id)]
    assert membership == MembershipDetail(
        organization_id=detail.organization_id,
        user_id=user_id,
        role="owner",
        created_at=NOW,
    )


@pytest.mark.asyncio
async def test_provision_organization_without_creator_has_no_membership() -> None:
    provisioning, repository, _issued = service()

    detail = await provisioning.provision_organization(
        trace_id=UUID(int=100),
        span_id=UUID(int=101),
        external_organization_id="org_ext_1",
        name="Acme",
    )

    assert repository.memberships == {}
    assert repository.identities == {}
    assert detail.organization_id in repository.organizations


@pytest.mark.asyncio
async def test_add_member_to_unprovisioned_organization_raises() -> None:
    provisioning, _repository, _issued = service()

    with pytest.raises(OrganizationNotFoundError):
        await provisioning.add_member(
            trace_id=UUID(int=100),
            span_id=UUID(int=101),
            external_organization_id="org_ext_never_provisioned",
            external_user_id="user_ext_1",
            email="person@acme.test",
            role="member",
        )


@pytest.mark.asyncio
async def test_add_member_creates_membership_and_upserts_identity() -> None:
    provisioning, repository, _issued = service()
    org = await provisioning.provision_organization(
        trace_id=UUID(int=100),
        span_id=UUID(int=101),
        external_organization_id="org_ext_1",
        name="Acme",
    )

    membership = await provisioning.add_member(
        trace_id=UUID(int=100),
        span_id=UUID(int=101),
        external_organization_id="org_ext_1",
        external_user_id="user_ext_1",
        email="person@acme.test",
        role="member",
        display_name="Person",
    )

    assert membership.role == "member"
    assert membership.organization_id == org.organization_id
    assert repository.memberships[(org.organization_id, membership.user_id)] == (
        membership
    )
    first_user_id = membership.user_id

    again = await provisioning.add_member(
        trace_id=UUID(int=100),
        span_id=UUID(int=101),
        external_organization_id="org_ext_1",
        external_user_id="user_ext_1",
        email="person@acme.test",
        role="member",
        display_name="Person",
    )

    assert again.user_id == first_user_id
    assert len(repository.identities) == 1
    assert len(repository.memberships) == 1


@pytest.mark.asyncio
async def test_update_member_role_changes_existing_membership() -> None:
    provisioning, repository, _issued = service()
    org = await provisioning.provision_organization(
        trace_id=UUID(int=100),
        span_id=UUID(int=101),
        external_organization_id="org_ext_1",
        name="Acme",
    )
    membership = await provisioning.add_member(
        trace_id=UUID(int=100),
        span_id=UUID(int=101),
        external_organization_id="org_ext_1",
        external_user_id="user_ext_1",
        email="person@acme.test",
        role="member",
    )

    updated = await provisioning.update_member_role(
        trace_id=UUID(int=100),
        span_id=UUID(int=101),
        external_organization_id="org_ext_1",
        external_user_id="user_ext_1",
        role="admin",
    )

    assert updated == MembershipDetail(
        organization_id=org.organization_id,
        user_id=membership.user_id,
        role="admin",
        created_at=NOW,
    )
    assert repository.memberships[(org.organization_id, membership.user_id)].role == (
        "admin"
    )


@pytest.mark.asyncio
async def test_update_member_role_without_existing_membership_raises() -> None:
    provisioning, _repository, _issued = service()
    await provisioning.provision_organization(
        trace_id=UUID(int=100),
        span_id=UUID(int=101),
        external_organization_id="org_ext_1",
        name="Acme",
    )

    with pytest.raises(OrganizationNotFoundError):
        await provisioning.update_member_role(
            trace_id=UUID(int=100),
            span_id=UUID(int=101),
            external_organization_id="org_ext_1",
            external_user_id="user_ext_never_added",
            role="admin",
        )


@pytest.mark.asyncio
async def test_remove_member_removes_existing_membership() -> None:
    provisioning, repository, _issued = service()
    org = await provisioning.provision_organization(
        trace_id=UUID(int=100),
        span_id=UUID(int=101),
        external_organization_id="org_ext_1",
        name="Acme",
    )
    membership = await provisioning.add_member(
        trace_id=UUID(int=100),
        span_id=UUID(int=101),
        external_organization_id="org_ext_1",
        external_user_id="user_ext_1",
        email="person@acme.test",
        role="member",
    )

    await provisioning.remove_member(
        trace_id=UUID(int=100),
        span_id=UUID(int=101),
        external_organization_id="org_ext_1",
        external_user_id="user_ext_1",
    )

    assert (org.organization_id, membership.user_id) not in repository.memberships
    # The identity itself must survive removal of the membership.
    assert repository.identities[("clerk", "user_ext_1")] == membership.user_id


@pytest.mark.asyncio
async def test_remove_member_is_noop_for_unprovisioned_organization() -> None:
    provisioning, _repository, _issued = service()

    await provisioning.remove_member(
        trace_id=UUID(int=100),
        span_id=UUID(int=101),
        external_organization_id="org_ext_never_provisioned",
        external_user_id="user_ext_1",
    )


@pytest.mark.asyncio
async def test_remove_member_is_noop_for_missing_membership() -> None:
    provisioning, repository, _issued = service()
    await provisioning.provision_organization(
        trace_id=UUID(int=100),
        span_id=UUID(int=101),
        external_organization_id="org_ext_1",
        name="Acme",
    )

    await provisioning.remove_member(
        trace_id=UUID(int=100),
        span_id=UUID(int=101),
        external_organization_id="org_ext_1",
        external_user_id="user_ext_never_added",
    )

    assert repository.memberships == {}
