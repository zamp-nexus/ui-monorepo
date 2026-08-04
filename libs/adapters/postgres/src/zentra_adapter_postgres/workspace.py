from __future__ import annotations

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from typing import Any
from uuid import UUID

from sqlalchemy import insert, select, tuple_, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncConnection
from zentra_application_analysis_run import (
    GroupCursor,
    GroupNameConflictError,
    GroupSlice,
)
from zentra_domain_analysis_run import Group

from .database import Database, set_organization_context
from .schema import workspace_groups

_NAME_CONSTRAINTS = frozenset({"uq_workspace_groups_organization_name"})


def _translate_integrity(error: IntegrityError) -> None:
    diagnostic = getattr(error.orig, "diag", None)
    if getattr(diagnostic, "constraint_name", None) in _NAME_CONSTRAINTS:
        raise GroupNameConflictError(
            "A workspace with this name already exists in its parent"
        ) from error
    raise error


def _group_from_row(row: Any) -> Group:
    value = row._mapping
    return Group(
        group_id=value["group_id"],
        organization_id=value["organization_id"],
        name=value["name"],
        normalized_name=value["normalized_name"],
        created_at=value["created_at"],
        updated_at=value["updated_at"],
        archived_at=value["archived_at"],
    )


class PostgresGroupRepository:
    def __init__(self, connection: AsyncConnection) -> None:
        self._connection = connection

    async def add_group(self, group: Group) -> None:
        try:
            await self._connection.execute(
                insert(workspace_groups).values(
                    group_id=group.group_id,
                    organization_id=group.organization_id,
                    name=group.name,
                    normalized_name=group.normalized_name,
                    created_at=group.created_at,
                    updated_at=group.updated_at,
                    archived_at=group.archived_at,
                )
            )
        except IntegrityError as error:
            _translate_integrity(error)

    async def get_group(
        self, group_id: UUID, *, for_update: bool = False
    ) -> Group | None:
        statement = select(workspace_groups).where(
            workspace_groups.c.group_id == group_id
        )
        if for_update:
            statement = statement.with_for_update()
        row = (await self._connection.execute(statement)).first()
        return _group_from_row(row) if row is not None else None

    async def save_group(self, group: Group) -> None:
        try:
            await self._connection.execute(
                update(workspace_groups)
                .where(workspace_groups.c.group_id == group.group_id)
                .values(
                    name=group.name,
                    normalized_name=group.normalized_name,
                    updated_at=group.updated_at,
                    archived_at=group.archived_at,
                )
            )
        except IntegrityError as error:
            _translate_integrity(error)

    async def list_groups(
        self,
        *,
        include_archived: bool,
        limit: int,
        after: GroupCursor | None,
    ) -> GroupSlice[Group]:
        statement = select(workspace_groups)
        if not include_archived:
            statement = statement.where(workspace_groups.c.archived_at.is_(None))
        if after is not None:
            statement = statement.where(
                tuple_(workspace_groups.c.updated_at, workspace_groups.c.group_id)
                < tuple_(after.sort_at, after.resource_id)
            )
        statement = statement.order_by(
            workspace_groups.c.updated_at.desc(), workspace_groups.c.group_id.desc()
        ).limit(limit + 1)
        rows = (await self._connection.execute(statement)).all()
        groups = tuple(_group_from_row(row) for row in rows)
        if len(groups) <= limit:
            return GroupSlice(groups, None)
        visible = groups[:limit]
        last = visible[-1]
        return GroupSlice(
            visible, GroupCursor(last.updated_at, last.group_id)
        )


class PostgresGroupUnitOfWork:
    def __init__(self, connection: AsyncConnection) -> None:
        self.groups = PostgresGroupRepository(connection)
        self.should_commit = False

    async def commit(self) -> None:
        self.should_commit = True


class PostgresGroupUnitOfWorkFactory:
    def __init__(self, database: Database) -> None:
        self._database = database

    @asynccontextmanager
    async def __call__(
        self,
        organization_id: UUID,
        trace_id: UUID,
        span_id: UUID,
    ) -> AsyncIterator[PostgresGroupUnitOfWork]:
        del trace_id, span_id
        async with self._database.engine.connect() as connection:
            transaction = await connection.begin()
            await set_organization_context(connection, organization_id)
            unit_of_work = PostgresGroupUnitOfWork(connection)
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
