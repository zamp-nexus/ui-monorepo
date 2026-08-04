from __future__ import annotations

import os
from datetime import UTC, datetime
from uuid import UUID, uuid4

import pytest
from sqlalchemy import insert
from sqlalchemy.ext.asyncio import create_async_engine
from zentra_domain_agent_execution import (
    SequenceExecutionFailureReason,
    SequenceTableReference,
)
from zentra_domain_sequence import (
    DatasetTableVersionReference,
    PreparedTable,
    Sequence,
    SequenceRun,
    SequenceRunFailed,
    SequenceRunSucceeded,
    SequenceStep,
    build_sequence_operation,
)

from zentra_adapter_postgres import Database, PostgresSequenceUnitOfWorkFactory
from zentra_adapter_postgres.schema import organizations
from zentra_adapter_postgres.sequence import PostgresSequenceRepository

OWNER_URL = os.getenv("TEST_DATABASE_OWNER_URL")
RUNTIME_URL = os.getenv("TEST_DATABASE_RUNTIME_URL")

pytestmark = pytest.mark.skipif(
    not OWNER_URL or not RUNTIME_URL,
    reason="local Postgres integration URLs are not configured",
)

NOW = datetime(2026, 8, 1, tzinfo=UTC)


async def _seed_organizations(*organization_ids: UUID) -> None:
    assert OWNER_URL is not None
    owner_engine = create_async_engine(OWNER_URL)
    async with owner_engine.begin() as connection:
        await connection.execute(
            insert(organizations),
            [{"organization_id": tid, "name": f"Tenant {tid}"} for tid in organization_ids],
        )
    await owner_engine.dispose()


def _build_sequence_with_two_steps(
    *,
    organization_id: UUID,
    sequence_id: UUID,
    dataset_workspace_id: UUID,
    thread_id: UUID | None = None,
) -> Sequence:
    sequence = Sequence.create(
        sequence_id=sequence_id,
        organization_id=organization_id,
        dataset_workspace_id=dataset_workspace_id,
        raw_table_reference=DatasetTableVersionReference(
            storage_locator="s3://fixtures/messy_orders.csv", file_format="csv"
        ),
        now=NOW,
        thread_id=thread_id,
    )

    step_1_id, table_1_id = uuid4(), uuid4()
    step_1 = SequenceStep(
        step_id=step_1_id,
        sequence_id=sequence_id,
        organization_id=organization_id,
        operation=build_sequence_operation("drop_nulls", {"columns": ["email"]}),
        input_reference=None,
        produced_table_id=table_1_id,
        created_at=NOW,
    )
    table_1 = PreparedTable(
        prepared_table_id=table_1_id,
        organization_id=organization_id,
        sequence_id=sequence_id,
        step_id=step_1_id,
        parent_table_reference=None,
        row_count=3,
        columns=("email", "amount"),
        created_at=NOW,
    )
    sequence.record_run(
        SequenceRun(
            run_id=uuid4(),
            sequence_id=sequence_id,
            organization_id=organization_id,
            step_id=step_1_id,
            outcome=SequenceRunSucceeded(produced_table_id=table_1_id),
            attempted_at=NOW,
        )
    )
    sequence.append_step(step_1, table_1)

    step_2_id, table_2_id = uuid4(), uuid4()
    table_1_ref = SequenceTableReference(
        organization_id=organization_id, reference_id=table_1_id, kind="prepared"
    )
    step_2 = SequenceStep(
        step_id=step_2_id,
        sequence_id=sequence_id,
        organization_id=organization_id,
        operation=build_sequence_operation("dedupe", {}),
        input_reference=table_1_ref,
        produced_table_id=table_2_id,
        created_at=NOW,
    )
    table_2 = PreparedTable(
        prepared_table_id=table_2_id,
        organization_id=organization_id,
        sequence_id=sequence_id,
        step_id=step_2_id,
        parent_table_reference=table_1_ref,
        row_count=2,
        columns=("email", "amount"),
        created_at=NOW,
    )
    sequence.record_run(
        SequenceRun(
            run_id=uuid4(),
            sequence_id=sequence_id,
            organization_id=organization_id,
            step_id=step_2_id,
            outcome=SequenceRunSucceeded(produced_table_id=table_2_id),
            attempted_at=NOW,
        )
    )
    sequence.append_step(step_2, table_2)

    sequence.record_run(
        SequenceRun(
            run_id=uuid4(),
            sequence_id=sequence_id,
            organization_id=organization_id,
            step_id=uuid4(),
            outcome=SequenceRunFailed(
                reason=SequenceExecutionFailureReason.CATALOG_VIOLATION,
                detail="unknown operation 'drop_table'",
            ),
            attempted_at=NOW,
        )
    )

    sequence.mark_final(table_2_id)
    return sequence


@pytest.mark.asyncio
async def test_sequence_lineage_and_immutability_survive_a_full_reload() -> None:
    assert RUNTIME_URL is not None
    organization_id = uuid4()
    await _seed_organizations(organization_id)

    sequence_id = uuid4()
    dataset_workspace_id = uuid4()
    original = _build_sequence_with_two_steps(
        organization_id=organization_id,
        sequence_id=sequence_id,
        dataset_workspace_id=dataset_workspace_id,
    )

    database = Database(RUNTIME_URL)
    factory = PostgresSequenceUnitOfWorkFactory(database)

    async with factory(organization_id, UUID(int=0), UUID(int=0)) as unit_of_work:
        await unit_of_work.sequences.add_sequence(original)
        for step, table in zip(original.steps, original.prepared_tables, strict=True):
            await unit_of_work.sequences.add_step(step, table)
        for run in original.runs:
            await unit_of_work.sequences.add_run(run)
        for prepared_table_id in original.final_table_ids:
            await unit_of_work.sequences.mark_final(
                sequence_id=sequence_id,
                prepared_table_id=prepared_table_id,
                organization_id=organization_id,
                marked_at=NOW,
            )
        await unit_of_work.commit()

    # Reload from a fresh connection/unit of work — no in-memory state reused.
    async with factory(organization_id, UUID(int=0), UUID(int=0)) as unit_of_work:
        reloaded = await unit_of_work.sequences.get_sequence(sequence_id)

    assert reloaded is not None
    assert reloaded.sequence_id == original.sequence_id
    assert reloaded.dataset_workspace_id == original.dataset_workspace_id
    assert reloaded.raw_table_reference == original.raw_table_reference
    assert len(reloaded.steps) == 2
    assert len(reloaded.prepared_tables) == 2
    assert len(reloaded.runs) == 3
    assert reloaded.final_table_ids == original.final_table_ids

    final_table_id = next(iter(original.final_table_ids))
    original_lineage = [
        t.prepared_table_id for t in original.lineage_for(final_table_id)
    ]
    reloaded_lineage = [
        t.prepared_table_id for t in reloaded.lineage_for(final_table_id)
    ]
    assert reloaded_lineage == original_lineage

    reloaded_operations = {step.step_id: step.operation for step in reloaded.steps}
    original_operations = {step.step_id: step.operation for step in original.steps}
    assert reloaded_operations == original_operations


@pytest.mark.asyncio
async def test_no_repository_method_can_mutate_a_persisted_prepared_table() -> None:
    public_methods = {
        name for name in dir(PostgresSequenceRepository) if not name.startswith("_")
    }
    assert "update_prepared_table" not in public_methods
    assert not any(name.startswith("update_prepared") for name in public_methods)


@pytest.mark.asyncio
async def test_cross_tenant_isolation_is_enforced_by_rls() -> None:
    assert RUNTIME_URL is not None
    organization_id = uuid4()
    other_organization_id = uuid4()
    await _seed_organizations(organization_id, other_organization_id)

    sequence_id = uuid4()
    original = _build_sequence_with_two_steps(
        organization_id=organization_id,
        sequence_id=sequence_id,
        dataset_workspace_id=uuid4(),
    )

    database = Database(RUNTIME_URL)
    factory = PostgresSequenceUnitOfWorkFactory(database)
    async with factory(organization_id, UUID(int=0), UUID(int=0)) as unit_of_work:
        await unit_of_work.sequences.add_sequence(original)
        for step, table in zip(original.steps, original.prepared_tables, strict=True):
            await unit_of_work.sequences.add_step(step, table)
        await unit_of_work.commit()

    async with factory(other_organization_id, UUID(int=0), UUID(int=0)) as unit_of_work:
        invisible = await unit_of_work.sequences.get_sequence(sequence_id)

    assert invisible is None


@pytest.mark.asyncio
async def test_thread_id_round_trips_through_a_full_reload() -> None:
    assert RUNTIME_URL is not None
    organization_id = uuid4()
    await _seed_organizations(organization_id)
    thread_id = uuid4()

    sequence_id = uuid4()
    original = _build_sequence_with_two_steps(
        organization_id=organization_id,
        sequence_id=sequence_id,
        dataset_workspace_id=uuid4(),
        thread_id=thread_id,
    )

    database = Database(RUNTIME_URL)
    factory = PostgresSequenceUnitOfWorkFactory(database)
    async with factory(organization_id, UUID(int=0), UUID(int=0)) as unit_of_work:
        await unit_of_work.sequences.add_sequence(original)
        await unit_of_work.commit()

    async with factory(organization_id, UUID(int=0), UUID(int=0)) as unit_of_work:
        reloaded = await unit_of_work.sequences.get_sequence(sequence_id)

    assert reloaded is not None
    assert reloaded.thread_id == thread_id


@pytest.mark.asyncio
async def test_list_sequences_orders_by_activity_and_isolates_tenants() -> None:
    assert RUNTIME_URL is not None
    organization_id = uuid4()
    other_organization_id = uuid4()
    await _seed_organizations(organization_id, other_organization_id)
    dataset_workspace_id = uuid4()

    older_id, newer_id, foreign_id = uuid4(), uuid4(), uuid4()
    older = _build_sequence_with_two_steps(
        organization_id=organization_id,
        sequence_id=older_id,
        dataset_workspace_id=dataset_workspace_id,
    )
    newer = Sequence.create(
        sequence_id=newer_id,
        organization_id=organization_id,
        dataset_workspace_id=dataset_workspace_id,
        raw_table_reference=DatasetTableVersionReference(
            storage_locator="s3://fixtures/clean_orders.csv", file_format="csv"
        ),
        now=datetime(2026, 8, 2, tzinfo=UTC),
        thread_id=uuid4(),
    )
    foreign_tenant_sequence = Sequence.create(
        sequence_id=foreign_id,
        organization_id=other_organization_id,
        dataset_workspace_id=uuid4(),
        raw_table_reference=DatasetTableVersionReference(
            storage_locator="s3://fixtures/other.csv", file_format="csv"
        ),
        now=NOW,
    )

    database = Database(RUNTIME_URL)
    factory = PostgresSequenceUnitOfWorkFactory(database)
    async with factory(organization_id, UUID(int=0), UUID(int=0)) as unit_of_work:
        await unit_of_work.sequences.add_sequence(older)
        for step, table in zip(older.steps, older.prepared_tables, strict=True):
            await unit_of_work.sequences.add_step(step, table)
        for run in older.runs:
            await unit_of_work.sequences.add_run(run)
        for prepared_table_id in older.final_table_ids:
            await unit_of_work.sequences.mark_final(
                sequence_id=older_id,
                prepared_table_id=prepared_table_id,
                organization_id=organization_id,
                marked_at=NOW,
            )
        await unit_of_work.sequences.add_sequence(newer)
        await unit_of_work.commit()
    async with factory(other_organization_id, UUID(int=0), UUID(int=0)) as unit_of_work:
        await unit_of_work.sequences.add_sequence(foreign_tenant_sequence)
        await unit_of_work.commit()

    async with factory(organization_id, UUID(int=0), UUID(int=0)) as unit_of_work:
        result = await unit_of_work.sequences.list_sequences(
            organization_id=organization_id, dataset_workspace_id=dataset_workspace_id
        )

    assert [item.sequence_id for item in result] == [newer_id, older_id]
    newer_item, older_item = result
    assert newer_item.origin.value == "manual"
    assert older_item.origin.value == "chat"
    assert older_item.step_count == 2
    assert older_item.final_table_count == 1
    assert older_item.failed_run_count == 1
