from __future__ import annotations

import os
from uuid import UUID

import pytest
from sqlalchemy import func, insert, select
from sqlalchemy.dialects.postgresql import insert as postgres_insert
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import create_async_engine

from zentra_adapter_postgres import resolve_identity_context
from zentra_adapter_postgres.database import set_tenant_context
from zentra_adapter_postgres.schema import (
    agent_executions,
    identity_subjects,
    investigations,
    tenant_identity_bindings,
    tenant_memberships,
    tenants,
    users,
)

OWNER_URL = os.getenv("TEST_DATABASE_OWNER_URL")
RUNTIME_URL = os.getenv("TEST_DATABASE_RUNTIME_URL")

pytestmark = pytest.mark.skipif(
    not OWNER_URL or not RUNTIME_URL,
    reason="local Postgres integration URLs are not configured",
)

TENANT_A = UUID("71000000-0000-0000-0000-000000000001")
TENANT_B = UUID("71000000-0000-0000-0000-000000000002")
USER_ID = UUID("72000000-0000-0000-0000-000000000001")
INVALID_USER_ID = UUID("72000000-0000-0000-0000-000000000002")
INVESTIGATION_ID = UUID("73000000-0000-0000-0000-000000000001")


async def seed(owner_url: str) -> None:
    owner = create_async_engine(owner_url)
    async with owner.begin() as connection:
        await connection.execute(
            postgres_insert(tenants)
            .values(
                [
                    {"tenant_id": TENANT_A, "name": "Integration A"},
                    {"tenant_id": TENANT_B, "name": "Integration B"},
                ]
            )
            .on_conflict_do_nothing()
        )
        await connection.execute(
            postgres_insert(users)
            .values(
                [
                    {"user_id": USER_ID, "email": "integration@example.com"},
                    {"user_id": INVALID_USER_ID, "email": "invalid@example.com"},
                ]
            )
            .on_conflict_do_nothing()
        )
        await connection.execute(
            postgres_insert(identity_subjects)
            .values(
                provider="clerk",
                external_subject_id="user_integration",
                user_id=USER_ID,
            )
            .on_conflict_do_nothing()
        )
        await connection.execute(
            postgres_insert(tenant_identity_bindings)
            .values(
                [
                    {
                        "provider": "clerk",
                        "external_tenant_id": "org_integration_a",
                        "tenant_id": TENANT_A,
                    },
                    {
                        "provider": "clerk",
                        "external_tenant_id": "org_integration_b",
                        "tenant_id": TENANT_B,
                    },
                ]
            )
            .on_conflict_do_nothing()
        )
        await connection.execute(
            postgres_insert(tenant_memberships)
            .values(
                [
                    {"tenant_id": TENANT_A, "user_id": USER_ID, "role": "owner"},
                    {"tenant_id": TENANT_B, "user_id": USER_ID, "role": "viewer"},
                ]
            )
            .on_conflict_do_nothing()
        )
        await connection.execute(
            postgres_insert(investigations)
            .values(
                investigation_id=INVESTIGATION_ID,
                tenant_id=TENANT_A,
                question="Integration fixture",
                status="running",
            )
            .on_conflict_do_nothing()
        )
    await owner.dispose()


@pytest.mark.asyncio
async def test_rls_identity_and_constraints() -> None:
    assert OWNER_URL is not None
    assert RUNTIME_URL is not None
    await seed(OWNER_URL)

    runtime = create_async_engine(RUNTIME_URL)
    async with runtime.begin() as connection:
        without_context = await connection.scalar(
            select(func.count()).select_from(tenants)
        )
    assert without_context == 0

    async with runtime.begin() as connection:
        identity = await resolve_identity_context(
            connection,
            provider="clerk",
            external_subject_id="user_integration",
            external_tenant_id="org_integration_a",
        )
        visible_memberships = await connection.scalar(
            select(func.count()).select_from(tenant_memberships)
        )
    assert identity.user_id == USER_ID
    assert identity.tenant_id == TENANT_A
    assert identity.role == "owner"
    assert visible_memberships == 1

    async with runtime.begin() as connection:
        await set_tenant_context(connection, TENANT_B)
        visible_tenants = (
            (await connection.execute(select(tenants.c.tenant_id))).scalars().all()
        )
    assert visible_tenants == [TENANT_B]
    await runtime.dispose()

    owner = create_async_engine(OWNER_URL)
    with pytest.raises(IntegrityError, match="ck_tenant_memberships_role"):
        async with owner.begin() as connection:
            await connection.execute(
                insert(tenant_memberships).values(
                    tenant_id=TENANT_A,
                    user_id=INVALID_USER_ID,
                    role="guest",
                )
            )

    with pytest.raises(IntegrityError, match="ck_agent_executions_typed_outcome"):
        async with owner.begin() as connection:
            await connection.execute(
                insert(agent_executions).values(
                    investigation_id=INVESTIGATION_ID,
                    tenant_id=TENANT_A,
                    agent_id="deterministic-validator",
                    step=0,
                    input={},
                    outcome_kind="validation",
                    confidence=0.9,
                    status="success",
                )
            )
    await owner.dispose()
