from __future__ import annotations

from collections.abc import Callable
from datetime import datetime
from uuid import UUID

from .organization_dto import (
    MembershipDetail,
    OrganizationDetail,
    OrganizationNotFoundError,
)
from .organization_ports import (
    OrganizationProvisioningUnitOfWork,
    OrganizationProvisioningUnitOfWorkFactory,
)

#: The only identity provider this service currently provisions from. A
#: webhook route for a second provider would add a `provider` parameter
#: rather than reuse this constant, but nothing calls for that yet.
CLERK_PROVIDER = "clerk"


class OrganizationProvisioningService:
    """Provisions internal Organizations/Users from Clerk webhook events.

    Replaces the developer running `tools/evals/bind_clerk_identity.py` by
    hand: this is the application-layer logic a webhook route calls to bind
    a Clerk Organization/User to this system's own `organizations`/`users`
    rows.
    """

    def __init__(
        self,
        *,
        unit_of_work_factory: OrganizationProvisioningUnitOfWorkFactory,
        now: Callable[[], datetime],
        new_id: Callable[[], UUID],
    ) -> None:
        self._unit_of_work_factory = unit_of_work_factory
        self._now = now
        self._new_id = new_id

    async def provision_organization(
        self,
        *,
        trace_id: UUID,
        span_id: UUID,
        external_organization_id: str,
        name: str,
        creator_external_user_id: str | None = None,
        creator_email: str | None = None,
        creator_display_name: str | None = None,
    ) -> OrganizationDetail:
        """Idempotent: calling again with the same external id is a no-op.

        `creator_external_user_id`/`creator_email` may be placeholders (the
        webhook handler decides why) — when absent, no membership row is
        created and the Organization has no members until `add_member` is
        called separately.
        """
        async with self._unit_of_work_factory(trace_id, span_id) as unit_of_work:
            existing_id = await unit_of_work.organizations.find_organization_id(
                CLERK_PROVIDER, external_organization_id
            )
            if existing_id is not None:
                existing = await unit_of_work.organizations.get_organization(
                    existing_id
                )
                assert existing is not None
                return existing

            organization_id = self._new_id()
            created_at = self._now()
            await unit_of_work.organizations.add_organization(
                organization_id, name=name, created_at=created_at
            )
            await unit_of_work.organizations.add_organization_binding(
                CLERK_PROVIDER,
                external_organization_id,
                organization_id=organization_id,
            )
            if creator_external_user_id is not None:
                user_id = await unit_of_work.organizations.upsert_identity(
                    CLERK_PROVIDER,
                    creator_external_user_id,
                    email=creator_email or "",
                    display_name=creator_display_name,
                    new_user_id=self._new_id(),
                    created_at=created_at,
                )
                await unit_of_work.organizations.add_membership(
                    organization_id, user_id, role="owner", created_at=created_at
                )
            await unit_of_work.commit()
            return OrganizationDetail(
                organization_id=organization_id, name=name, created_at=created_at
            )

    async def add_member(
        self,
        *,
        trace_id: UUID,
        span_id: UUID,
        external_organization_id: str,
        external_user_id: str,
        email: str,
        role: str,
        display_name: str | None = None,
    ) -> MembershipDetail:
        created_at = self._now()
        async with self._unit_of_work_factory(trace_id, span_id) as unit_of_work:
            organization_id = await self._require_organization_id(
                unit_of_work, external_organization_id
            )
            user_id = await unit_of_work.organizations.upsert_identity(
                CLERK_PROVIDER,
                external_user_id,
                email=email,
                display_name=display_name,
                new_user_id=self._new_id(),
                created_at=created_at,
            )
            await unit_of_work.organizations.add_membership(
                organization_id, user_id, role=role, created_at=created_at
            )
            await unit_of_work.commit()
            return MembershipDetail(
                organization_id=organization_id,
                user_id=user_id,
                role=role,
                created_at=created_at,
            )

    async def update_member_role(
        self,
        *,
        trace_id: UUID,
        span_id: UUID,
        external_organization_id: str,
        external_user_id: str,
        role: str,
    ) -> MembershipDetail:
        async with self._unit_of_work_factory(trace_id, span_id) as unit_of_work:
            organization_id = await self._require_organization_id(
                unit_of_work, external_organization_id
            )
            user_id = await unit_of_work.organizations.find_user_id(
                CLERK_PROVIDER, external_user_id
            )
            if user_id is None:
                raise OrganizationNotFoundError(
                    "This identity has no membership to update"
                )
            await unit_of_work.organizations.save_membership_role(
                organization_id, user_id, role=role
            )
            membership = await unit_of_work.organizations.get_membership(
                organization_id, user_id
            )
            await unit_of_work.commit()
            assert membership is not None
            return membership

    async def remove_member(
        self,
        *,
        trace_id: UUID,
        span_id: UUID,
        external_organization_id: str,
        external_user_id: str,
    ) -> None:
        """No-op if the Organization or the membership does not exist.

        Only removes the `organization_memberships` row. The underlying
        `users`/`identity_subjects` rows are never touched here — a user
        keeps their identity for any other Organization they belong to.
        """
        async with self._unit_of_work_factory(trace_id, span_id) as unit_of_work:
            organization_id = await unit_of_work.organizations.find_organization_id(
                CLERK_PROVIDER, external_organization_id
            )
            if organization_id is None:
                return
            user_id = await unit_of_work.organizations.find_user_id(
                CLERK_PROVIDER, external_user_id
            )
            if user_id is None:
                return
            await unit_of_work.organizations.remove_membership(
                organization_id, user_id
            )
            await unit_of_work.commit()

    @staticmethod
    async def _require_organization_id(
        unit_of_work: OrganizationProvisioningUnitOfWork,
        external_organization_id: str,
    ) -> UUID:
        organization_id = await unit_of_work.organizations.find_organization_id(
            CLERK_PROVIDER, external_organization_id
        )
        if organization_id is None:
            raise OrganizationNotFoundError(
                "This Organization has not been provisioned yet"
            )
        return organization_id
