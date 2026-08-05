from __future__ import annotations

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from datetime import datetime
from typing import Any
from uuid import UUID

from sqlalchemy import insert, select, update
from sqlalchemy.ext.asyncio import AsyncConnection
from zentra_application_analysis_run import MembershipDetail, OrganizationDetail

from .database import Database, set_organization_context
from .schema import (
    identity_subjects,
    organization_identity_bindings,
    organization_memberships,
    organizations,
    users,
)


def _organization_from_row(row: Any) -> OrganizationDetail:
    value = row._mapping
    return OrganizationDetail(
        organization_id=value["organization_id"],
        name=value["name"],
        created_at=value["created_at"],
    )


def _membership_from_row(row: Any) -> MembershipDetail:
    value = row._mapping
    return MembershipDetail(
        organization_id=value["organization_id"],
        user_id=value["user_id"],
        role=value["role"],
        created_at=value["created_at"],
    )


class PostgresOrganizationProvisioningRepository:
    def __init__(self, connection: AsyncConnection) -> None:
        self._connection = connection

    async def find_organization_id(
        self, provider: str, external_organization_id: str
    ) -> UUID | None:
        row = (
            await self._connection.execute(
                select(organization_identity_bindings.c.organization_id).where(
                    organization_identity_bindings.c.provider == provider,
                    organization_identity_bindings.c.external_organization_id
                    == external_organization_id,
                )
            )
        ).first()
        return row.organization_id if row is not None else None

    async def get_organization(
        self, organization_id: UUID
    ) -> OrganizationDetail | None:
        # `organizations` is RLS-scoped (per the ports docstring), unlike
        # `organization_identity_bindings` -- the id is already known here,
        # so scope the session before reading it.
        await set_organization_context(self._connection, organization_id)
        row = (
            await self._connection.execute(
                select(organizations).where(
                    organizations.c.organization_id == organization_id
                )
            )
        ).first()
        return _organization_from_row(row) if row is not None else None

    async def add_organization(
        self, organization_id: UUID, *, name: str, created_at: datetime
    ) -> None:
        # `organizations` is RLS-scoped. The row being inserted has to scope
        # the session that then permits its own insert — there is nothing
        # else to scope by until this id exists.
        await set_organization_context(self._connection, organization_id)
        await self._connection.execute(
            insert(organizations).values(
                organization_id=organization_id,
                name=name,
                created_at=created_at,
            )
        )

    async def rename_organization(self, organization_id: UUID, *, name: str) -> None:
        await set_organization_context(self._connection, organization_id)
        await self._connection.execute(
            update(organizations)
            .where(organizations.c.organization_id == organization_id)
            .values(name=name)
        )

    async def add_organization_binding(
        self,
        provider: str,
        external_organization_id: str,
        *,
        organization_id: UUID,
    ) -> None:
        await self._connection.execute(
            insert(organization_identity_bindings).values(
                provider=provider,
                external_organization_id=external_organization_id,
                organization_id=organization_id,
            )
        )

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
        existing = (
            await self._connection.execute(
                select(identity_subjects.c.user_id).where(
                    identity_subjects.c.provider == provider,
                    identity_subjects.c.external_subject_id == external_subject_id,
                )
            )
        ).first()
        if existing is not None:
            return existing.user_id

        await self._connection.execute(
            insert(users).values(
                user_id=new_user_id,
                email=email,
                display_name=display_name,
                created_at=created_at,
            )
        )
        await self._connection.execute(
            insert(identity_subjects).values(
                provider=provider,
                external_subject_id=external_subject_id,
                user_id=new_user_id,
                created_at=created_at,
            )
        )
        return new_user_id

    async def find_user_id(
        self, provider: str, external_subject_id: str
    ) -> UUID | None:
        row = (
            await self._connection.execute(
                select(identity_subjects.c.user_id).where(
                    identity_subjects.c.provider == provider,
                    identity_subjects.c.external_subject_id == external_subject_id,
                )
            )
        ).first()
        return row.user_id if row is not None else None

    async def add_membership(
        self,
        organization_id: UUID,
        user_id: UUID,
        *,
        role: str,
        created_at: datetime,
    ) -> None:
        await set_organization_context(self._connection, organization_id)
        existing = await self.get_membership(organization_id, user_id)
        if existing is not None:
            return
        await self._connection.execute(
            insert(organization_memberships).values(
                organization_id=organization_id,
                user_id=user_id,
                role=role,
                created_at=created_at,
            )
        )

    async def get_membership(
        self, organization_id: UUID, user_id: UUID
    ) -> MembershipDetail | None:
        await set_organization_context(self._connection, organization_id)
        row = (
            await self._connection.execute(
                select(organization_memberships).where(
                    organization_memberships.c.organization_id == organization_id,
                    organization_memberships.c.user_id == user_id,
                )
            )
        ).first()
        return _membership_from_row(row) if row is not None else None

    async def save_membership_role(
        self, organization_id: UUID, user_id: UUID, *, role: str
    ) -> None:
        await set_organization_context(self._connection, organization_id)
        await self._connection.execute(
            update(organization_memberships)
            .where(
                organization_memberships.c.organization_id == organization_id,
                organization_memberships.c.user_id == user_id,
            )
            .values(role=role)
        )

    async def remove_membership(self, organization_id: UUID, user_id: UUID) -> None:
        await set_organization_context(self._connection, organization_id)
        await self._connection.execute(
            organization_memberships.delete().where(
                organization_memberships.c.organization_id == organization_id,
                organization_memberships.c.user_id == user_id,
            )
        )


class PostgresOrganizationProvisioningUnitOfWork:
    def __init__(self, connection: AsyncConnection) -> None:
        self.organizations = PostgresOrganizationProvisioningRepository(connection)
        self.should_commit = False

    async def commit(self) -> None:
        self.should_commit = True


class PostgresOrganizationProvisioningUnitOfWorkFactory:
    def __init__(self, database: Database) -> None:
        self._database = database

    @asynccontextmanager
    async def __call__(
        self,
        trace_id: UUID,
        span_id: UUID,
    ) -> AsyncIterator[PostgresOrganizationProvisioningUnitOfWork]:
        del trace_id, span_id
        # Deliberately no up-front `set_organization_context` call: there is
        # no Organization id to scope by until the repository mints one (see
        # `OrganizationProvisioningUnitOfWorkFactory.__call__`'s docstring).
        async with self._database.engine.connect() as connection:
            transaction = await connection.begin()
            unit_of_work = PostgresOrganizationProvisioningUnitOfWork(connection)
            try:
                yield unit_of_work
            except Exception:
                await transaction.rollback()
                raise
            else:
                if unit_of_work.should_commit:
                    await transaction.commit()
                else:
                    await transaction.rollback()
