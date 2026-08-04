from __future__ import annotations

import asyncio
import os
from uuid import NAMESPACE_URL, uuid5

from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import create_async_engine

from .schema import (
    identity_subjects,
    organization_identity_bindings,
    organization_memberships,
    organizations,
    users,
)

ALLOWED_ROLES = {"owner", "admin", "member", "viewer"}


def required_env(name: str) -> str:
    value = os.getenv(name)
    if not value:
        raise RuntimeError(f"{name} is required")
    return value


async def bootstrap() -> None:
    role = os.getenv("BOOTSTRAP_ROLE", "owner")
    if role not in ALLOWED_ROLES:
        raise RuntimeError(f"BOOTSTRAP_ROLE must be one of {sorted(ALLOWED_ROLES)}")

    engine = create_async_engine(required_env("DATABASE_OWNER_URL"))
    external_organization_id = required_env("CLERK_ORGANIZATION_ID")
    external_subject_id = required_env("CLERK_USER_ID")
    organization_id = uuid5(
        NAMESPACE_URL, f"zentraos:clerk:tenant:{external_organization_id}"
    )
    user_id = uuid5(NAMESPACE_URL, f"zentraos:clerk:user:{external_subject_id}")
    async with engine.begin() as connection:
        await connection.execute(
            insert(organizations)
            .values(
                organization_id=organization_id,
                name=required_env("BOOTSTRAP_TENANT_NAME"),
                data_residency_zone=os.getenv("BOOTSTRAP_RESIDENCY", "us-east"),
            )
            .on_conflict_do_update(
                index_elements=[organizations.c.organization_id],
                set_={"name": required_env("BOOTSTRAP_TENANT_NAME")},
            )
        )
        await connection.execute(
            insert(organization_identity_bindings)
            .values(
                provider="clerk",
                external_organization_id=external_organization_id,
                organization_id=organization_id,
            )
            .on_conflict_do_update(
                index_elements=[
                    organization_identity_bindings.c.provider,
                    organization_identity_bindings.c.external_organization_id,
                ],
                set_={"organization_id": organization_id},
            )
        )

        await connection.execute(
            insert(users)
            .values(
                user_id=user_id,
                email=required_env("BOOTSTRAP_USER_EMAIL"),
                display_name=os.getenv("BOOTSTRAP_USER_NAME"),
            )
            .on_conflict_do_update(
                index_elements=[users.c.user_id],
                set_={
                    "email": required_env("BOOTSTRAP_USER_EMAIL"),
                    "display_name": os.getenv("BOOTSTRAP_USER_NAME"),
                },
            )
        )
        await connection.execute(
            insert(identity_subjects)
            .values(
                provider="clerk",
                external_subject_id=external_subject_id,
                user_id=user_id,
            )
            .on_conflict_do_update(
                index_elements=[
                    identity_subjects.c.provider,
                    identity_subjects.c.external_subject_id,
                ],
                set_={"user_id": user_id},
            )
        )
        await connection.execute(
            insert(organization_memberships)
            .values(organization_id=organization_id, user_id=user_id, role=role)
            .on_conflict_do_update(
                index_elements=[
                    organization_memberships.c.organization_id,
                    organization_memberships.c.user_id,
                ],
                set_={"role": role},
            )
        )
    await engine.dispose()


if __name__ == "__main__":
    asyncio.run(bootstrap())
