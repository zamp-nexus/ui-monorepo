from __future__ import annotations

from dataclasses import dataclass
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncConnection

from .database import set_organization_context
from .schema import (
    identity_subjects,
    organization_identity_bindings,
    organization_memberships,
    organizations,
    users,
)


class IdentityNotBoundError(LookupError):
    pass


@dataclass(frozen=True, slots=True)
class IdentityContext:
    user_id: UUID
    organization_id: UUID
    email: str
    organization_name: str
    role: str


async def resolve_identity_context(
    connection: AsyncConnection,
    *,
    provider: str,
    external_subject_id: str,
    external_organization_id: str,
) -> IdentityContext:
    organization_row = (
        await connection.execute(
            select(organization_identity_bindings.c.organization_id).where(
                organization_identity_bindings.c.provider == provider,
                organization_identity_bindings.c.external_organization_id
                == external_organization_id,
            )
        )
    ).one_or_none()
    if organization_row is None:
        raise IdentityNotBoundError(
            "Identity organization is not bound to any organization"
        )

    await set_organization_context(connection, organization_row.organization_id)
    organization_name = (
        await connection.execute(
            select(organizations.c.name).where(
                organizations.c.organization_id == organization_row.organization_id
            )
        )
    ).scalar_one()
    membership_row = (
        await connection.execute(
            select(
                users.c.user_id,
                users.c.email,
                organization_memberships.c.role,
            )
            .join(
                identity_subjects,
                identity_subjects.c.user_id == users.c.user_id,
            )
            .join(
                organization_memberships,
                organization_memberships.c.user_id == users.c.user_id,
            )
            .where(
                identity_subjects.c.provider == provider,
                identity_subjects.c.external_subject_id == external_subject_id,
                organization_memberships.c.organization_id
                == organization_row.organization_id,
            )
        )
    ).one_or_none()
    if membership_row is None:
        raise IdentityNotBoundError(
            "Identity subject has no membership in this organization"
        )

    return IdentityContext(
        user_id=membership_row.user_id,
        organization_id=organization_row.organization_id,
        email=membership_row.email,
        organization_name=organization_name,
        role=membership_row.role,
    )
