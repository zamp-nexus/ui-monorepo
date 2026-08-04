"""Bind a Clerk organization and user to a Nexus organization and membership.

Signing in to Clerk is not enough. The API resolves every request through
`resolve_identity_context`, which needs two rows that Clerk knows nothing about:

    organization_identity_bindings   clerk org  -> organizations.organization_id
    identity_subjects                clerk user -> users.user_id

Without them the browser signs in cleanly and every API call returns 403 with
"Identity organization is not bound to a organization" — a failure that looks
like a Clerk problem and is not one. This script creates the organization, the
user, the owner membership, and both bindings.

    uv run python tools/evals/bind_clerk_identity.py \\
        --org org_31yA... --user user_31yB... --email you@example.com

Re-running with the same ids is safe: it reports what already exists rather than
duplicating it. Find both ids in the Clerk dashboard, or read them off the JWT
the browser is sending (`sub` and `org_id`).
"""

from __future__ import annotations

import argparse
import asyncio
import os
from uuid import uuid4

from sqlalchemy import insert, select
from sqlalchemy.ext.asyncio import create_async_engine
from zentra_adapter_postgres.schema import (
    identity_subjects,
    organization_identity_bindings,
    organization_memberships,
    organizations,
    users,
)

PROVIDER = "clerk"

OWNER_URL = os.environ.get(
    "DATABASE_OWNER_URL",
    "postgresql+psycopg://zentra_owner:zentra_owner@localhost:5432/zentra_control",
)


async def bind(*, org: str, user: str, email: str, name: str, tier: str) -> int:
    engine = create_async_engine(OWNER_URL)
    async with engine.begin() as connection:
        organization_id = (
            await connection.execute(
                select(organization_identity_bindings.c.organization_id).where(
                    organization_identity_bindings.c.provider == PROVIDER,
                    organization_identity_bindings.c.external_organization_id == org,
                )
            )
        ).scalar_one_or_none()

        if organization_id is None:
            organization_id = uuid4()
            await connection.execute(
                insert(organizations).values(
                    organization_id=organization_id, name=name, model_tier=tier
                )
            )
            await connection.execute(
                insert(organization_identity_bindings).values(
                    provider=PROVIDER,
                    external_organization_id=org,
                    organization_id=organization_id,
                )
            )
            print(f"organization   created  {organization_id}  ({name}, {tier} tier)")
        else:
            print(f"organization   exists   {organization_id}")

        user_id = (
            await connection.execute(
                select(identity_subjects.c.user_id).where(
                    identity_subjects.c.provider == PROVIDER,
                    identity_subjects.c.external_subject_id == user,
                )
            )
        ).scalar_one_or_none()

        if user_id is None:
            user_id = uuid4()
            await connection.execute(insert(users).values(user_id=user_id, email=email))
            await connection.execute(
                insert(identity_subjects).values(
                    provider=PROVIDER, external_subject_id=user, user_id=user_id
                )
            )
            print(f"user           created  {user_id}  ({email})")
        else:
            print(f"user           exists   {user_id}")

        existing_role = (
            await connection.execute(
                select(organization_memberships.c.role).where(
                    organization_memberships.c.organization_id == organization_id,
                    organization_memberships.c.user_id == user_id,
                )
            )
        ).scalar_one_or_none()

        if existing_role is None:
            await connection.execute(
                insert(organization_memberships).values(
                    organization_id=organization_id, user_id=user_id, role="owner"
                )
            )
            print("member         created  owner")
        else:
            # Not upgraded silently: a demotion to viewer is usually deliberate.
            print(f"member         exists   {existing_role}")

    await engine.dispose()
    print("\nSigned-in requests from this org will now resolve. Reload the app.")
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--org", required=True, help="Clerk organization id (org_...)")
    parser.add_argument("--user", required=True, help="Clerk user id (user_...)")
    parser.add_argument("--email", required=True, help="Email to record for the user")
    parser.add_argument("--name", default="Local Development", help="Organization name")
    parser.add_argument(
        "--tier",
        choices=["free", "premium"],
        default="premium",
        help="Model tier for the organization. Premium is the tier that can publish.",
    )
    args = parser.parse_args()

    for label, value in (("org", args.org), ("user", args.user)):
        if not value.startswith(f"{label}_"):
            raise SystemExit(
                f"--{label} should look like {label}_..., got {value!r}. "
                "Copy it from the Clerk dashboard or the JWT."
            )

    return asyncio.run(
        bind(
            org=args.org,
            user=args.user,
            email=args.email,
            name=args.name,
            tier=args.tier,
        )
    )


if __name__ == "__main__":
    raise SystemExit(main())
