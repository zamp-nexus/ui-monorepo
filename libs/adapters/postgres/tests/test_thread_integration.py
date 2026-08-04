from __future__ import annotations

import os
from datetime import UTC, datetime
from uuid import uuid4

import pytest
from sqlalchemy import func, insert, select
from sqlalchemy.ext.asyncio import create_async_engine
from zentra_application_investigation import (
    AuthenticatedActor,
    GroupService,
    Role,
    ThreadNotFoundError,
    ThreadService,
)
from zentra_application_investigation.thread_dto import (
    RoutingDisposition,
    RoutingResult,
)

from zentra_adapter_postgres import (
    Database,
    PostgresGroupUnitOfWorkFactory,
    PostgresThreadUnitOfWorkFactory,
)
from zentra_adapter_postgres.schema import (
    chat_sessions,
    data_sources,
    messages,
    organizations,
    users,
)

OWNER_URL = os.getenv("TEST_DATABASE_OWNER_URL")
RUNTIME_URL = os.getenv("TEST_DATABASE_RUNTIME_URL")

pytestmark = pytest.mark.skipif(
    not OWNER_URL or not RUNTIME_URL,
    reason="local Postgres integration URLs are not configured",
)


class _UnresolvedIntake:
    """Always clarifies rather than resolving -- this test exercises Thread
    atomicity and organization-scoping, not Intake's own routing judgement,
    so it only needs a second (router clarification) message to land
    alongside the first, deterministically."""

    async def resolve(
        self,
        question: str,
        *,
        organization_id,
        data_connection_id=None,
    ) -> RoutingResult:
        del question, organization_id, data_connection_id
        return RoutingResult(
            disposition=RoutingDisposition.UNSUPPORTED,
            scenario_key=None,
            canonical_question=None,
            clarification="I could not map that message to a governed question.",
            suggestions=(),
        )


class _FakeConversational:
    async def reply(self, message: str, *, organization_id) -> str:
        del message, organization_id
        return "Thanks for reaching out!"


class _FakeAuditWriter:
    """This test exercises Thread atomicity, not audit delivery -- flushing
    is a real ClickHouse round trip `AuditDeliveryCoordinator` owns, so a
    no-op stands in for it here."""

    async def flush(self, *, organization_id, investigation_id) -> bool:
        del organization_id, investigation_id
        return True


def actor(organization_id, *, role: Role = Role.OWNER) -> AuthenticatedActor:
    return AuthenticatedActor(
        user_id=uuid4(),
        organization_id=organization_id,
        role=role,
        trace_id=uuid4(),
        span_id=uuid4(),
    )


@pytest.mark.asyncio
async def test_thread_and_first_message_are_atomic_and_organization_scoped() -> None:
    assert OWNER_URL is not None
    assert RUNTIME_URL is not None
    organization_id = uuid4()
    other_organization_id = uuid4()
    owner = actor(organization_id)
    owner_engine = create_async_engine(OWNER_URL)
    async with owner_engine.begin() as connection:
        await connection.execute(
            insert(organizations),
            [
                {"organization_id": organization_id, "name": "Thread Organization"},
                {
                    "organization_id": other_organization_id,
                    "name": "Other Organization",
                },
            ],
        )
        await connection.execute(
            insert(users),
            {"user_id": owner.user_id, "email": "thread-owner@example.com"},
        )

    database = Database(RUNTIME_URL)

    def now() -> datetime:
        return datetime.now(UTC)

    groups = GroupService(
        unit_of_work_factory=PostgresGroupUnitOfWorkFactory(database),
        now=now,
        new_id=uuid4,
    )
    threads = ThreadService(
        unit_of_work_factory=PostgresThreadUnitOfWorkFactory(database),
        intake=_UnresolvedIntake(),
        conversational=_FakeConversational(),
        audit_writer=_FakeAuditWriter(),
        now=now,
        new_id=uuid4,
    )
    group = await groups.create_group(owner, name="Finance")

    draft = await threads.create(
        owner, project_id=group.group_id, content="How is the business doing?"
    )

    with pytest.raises(ThreadNotFoundError):
        await threads.get(actor(other_organization_id), draft.thread_id)
    async with owner_engine.connect() as connection:
        thread_count = await connection.scalar(
            select(func.count())
            .select_from(chat_sessions)
            .where(chat_sessions.c.chat_session_id == draft.thread_id)
        )
        message_count = await connection.scalar(
            select(func.count())
            .select_from(messages)
            .where(messages.c.chat_session_id == draft.thread_id)
        )
    assert thread_count == 1
    assert message_count == 2

    await threads.delete(owner, draft.thread_id)
    await database.close()
    async with owner_engine.begin() as connection:
        await connection.execute(
            organizations.delete().where(
                organizations.c.organization_id.in_(
                    (organization_id, other_organization_id)
                )
            )
        )
        await connection.execute(
            users.delete().where(users.c.user_id == owner.user_id)
        )
    await owner_engine.dispose()


@pytest.mark.asyncio
async def test_default_data_connection_id_round_trips_and_is_organization_scoped() -> (
    None
):
    assert OWNER_URL is not None
    assert RUNTIME_URL is not None
    organization_id = uuid4()
    other_organization_id = uuid4()
    data_source_id = uuid4()
    owner = actor(organization_id)
    owner_engine = create_async_engine(OWNER_URL)
    async with owner_engine.begin() as connection:
        await connection.execute(
            insert(organizations),
            [
                {
                    "organization_id": organization_id,
                    "name": "Dataset Default Organization",
                },
                {
                    "organization_id": other_organization_id,
                    "name": "Other Dataset Default Organization",
                },
            ],
        )
        await connection.execute(
            insert(users),
            {"user_id": owner.user_id, "email": "dataset-default-owner@example.com"},
        )
        await connection.execute(
            insert(data_sources),
            {
                "data_source_id": data_source_id,
                "organization_id": organization_id,
                "name": "Production",
                "kind": "uploaded",
                "health": "unverified",
            },
        )

    database = Database(RUNTIME_URL)

    def now() -> datetime:
        return datetime.now(UTC)

    groups = GroupService(
        unit_of_work_factory=PostgresGroupUnitOfWorkFactory(database),
        now=now,
        new_id=uuid4,
    )
    threads = ThreadService(
        unit_of_work_factory=PostgresThreadUnitOfWorkFactory(database),
        intake=_UnresolvedIntake(),
        conversational=_FakeConversational(),
        audit_writer=_FakeAuditWriter(),
        now=now,
        new_id=uuid4,
    )
    group = await groups.create_group(owner, name="Finance")
    draft = await threads.create(
        owner, project_id=group.group_id, content="How is the business doing?"
    )

    uow_factory = PostgresThreadUnitOfWorkFactory(database)

    async with uow_factory(organization_id, uuid4(), uuid4()) as uow:
        assert await uow.threads.default_data_connection_id(draft.thread_id) is None
        await uow.threads.set_default_data_connection_id(
            draft.thread_id, data_source_id
        )
        await uow.commit()

    async with uow_factory(organization_id, uuid4(), uuid4()) as uow:
        assert (
            await uow.threads.default_data_connection_id(draft.thread_id)
            == data_source_id
        )

    async with uow_factory(other_organization_id, uuid4(), uuid4()) as uow:
        assert await uow.threads.default_data_connection_id(draft.thread_id) is None

    await threads.delete(owner, draft.thread_id)
    await database.close()
    async with owner_engine.begin() as connection:
        await connection.execute(
            data_sources.delete().where(data_sources.c.data_source_id == data_source_id)
        )
        await connection.execute(
            organizations.delete().where(
                organizations.c.organization_id.in_(
                    (organization_id, other_organization_id)
                )
            )
        )
        await connection.execute(
            users.delete().where(users.c.user_id == owner.user_id)
        )
    await owner_engine.dispose()
