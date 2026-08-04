from __future__ import annotations

from contextlib import AbstractAsyncContextManager
from datetime import datetime
from typing import Protocol
from uuid import UUID

from .organization_dto import MembershipDetail, OrganizationDetail


class OrganizationProvisioningRepository(Protocol):
    async def find_organization_id(
        self, provider: str, external_organization_id: str
    ) -> UUID | None: ...

    async def get_organization(
        self, organization_id: UUID
    ) -> OrganizationDetail | None: ...

    async def add_organization(
        self, organization_id: UUID, *, name: str, created_at: datetime
    ) -> None: ...

    async def add_organization_binding(
        self,
        provider: str,
        external_organization_id: str,
        *,
        organization_id: UUID,
    ) -> None: ...

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
        """Return the `users.user_id` bound to this external subject.

        Upsert: a caller may already have an identity from a prior
        Organization, so this must not create a second `users` row for the
        same (provider, external_subject_id).
        """
        ...

    async def find_user_id(
        self, provider: str, external_subject_id: str
    ) -> UUID | None: ...

    async def add_membership(
        self,
        organization_id: UUID,
        user_id: UUID,
        *,
        role: str,
        created_at: datetime,
    ) -> None:
        """Upsert: safe to call again with the same organization/user pair."""
        ...

    async def get_membership(
        self, organization_id: UUID, user_id: UUID
    ) -> MembershipDetail | None: ...

    async def save_membership_role(
        self, organization_id: UUID, user_id: UUID, *, role: str
    ) -> None: ...

    async def remove_membership(self, organization_id: UUID, user_id: UUID) -> None:
        """No-op if the membership does not exist."""
        ...


class OrganizationProvisioningUnitOfWork(Protocol):
    organizations: OrganizationProvisioningRepository

    async def commit(self) -> None: ...


class OrganizationProvisioningUnitOfWorkFactory(Protocol):
    def __call__(
        self, trace_id: UUID, span_id: UUID
    ) -> AbstractAsyncContextManager[OrganizationProvisioningUnitOfWork]:
        """Open a unit of work for Organization provisioning.

        Deliberately takes no `organization_id`, unlike every other
        UnitOfWorkFactory in this codebase (e.g. `GroupUnitOfWorkFactory`).
        Those factories scope the RLS session (`app.organization_id`) up
        front because the caller already has an Organization to act within.
        `provision_organization` does not: the Organization row does not
        exist yet at the start of the transaction, so there is nothing to
        scope by until it is inserted.

        Do not "fix" this to match the other factories. The repository
        implementation is responsible for calling `set_organization_context`
        itself, immediately before it touches an RLS-scoped table
        (`organizations`, `organization_memberships`) — after the
        Organization id has been minted, not before. `users`,
        `identity_subjects`, and `organization_identity_bindings` are not
        RLS-scoped at all (see `UNISOLATED_ORGANIZATION_TABLES` and
        `GLOBAL_TABLES` in the schema migration), so writes to those three
        tables need no context set at all.
        """
        ...
