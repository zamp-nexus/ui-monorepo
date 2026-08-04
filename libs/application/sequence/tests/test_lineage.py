from __future__ import annotations

from datetime import UTC, datetime, timedelta
from uuid import UUID, uuid4

import pytest
from zentra_domain_agent_execution import (
    SequenceExecutionFailureReason,
    SequenceTableReference,
)
from zentra_domain_sequence import (
    ConnectorSourceTableReference,
    DatasetTableVersionReference,
    DropNullsParameters,
    PreparedTable,
    Sequence,
    SequenceRun,
    SequenceRunFailed,
    SequenceRunSucceeded,
    SequenceStep,
)

from zentra_application_sequence import (
    PreparedTableNotFoundError,
    SequenceOrigin,
    anchor_for_failed_run,
    build_graph_view,
    build_preview,
    raw_table_label,
)

TENANT_ID = UUID("20000000-0000-0000-0000-000000000002")
WORKSPACE_ID = UUID("30000000-0000-0000-0000-000000000003")
BASE = datetime(2026, 8, 1, tzinfo=UTC)


def _connector_table() -> ConnectorSourceTableReference:
    return ConnectorSourceTableReference(
        catalog_version_id="cv-1", source_table_name="clickathon.orders"
    )


def _prepared_table(
    *,
    prepared_table_id: UUID,
    step_id: UUID,
    parent: UUID | None,
    created_at: datetime,
    row_count: int = 10,
    columns: tuple[str, ...] = ("id", "email"),
) -> PreparedTable:
    return PreparedTable(
        prepared_table_id=prepared_table_id,
        organization_id=TENANT_ID,
        sequence_id=uuid4(),
        step_id=step_id,
        parent_table_reference=(
            SequenceTableReference(
                organization_id=TENANT_ID, reference_id=parent, kind="prepared"
            )
            if parent is not None
            else None
        ),
        row_count=row_count,
        columns=columns,
        created_at=created_at,
    )


def _step(
    *,
    step_id: UUID,
    produced_table_id: UUID,
    input_id: UUID | None,
    created_at: datetime,
) -> SequenceStep:
    return SequenceStep(
        step_id=step_id,
        sequence_id=uuid4(),
        organization_id=TENANT_ID,
        operation=DropNullsParameters(columns=("email",)),
        input_reference=(
            SequenceTableReference(
                organization_id=TENANT_ID, reference_id=input_id, kind="prepared"
            )
            if input_id is not None
            else None
        ),
        produced_table_id=produced_table_id,
        created_at=created_at,
    )


def _sequence(
    *, steps: tuple, prepared_tables: tuple, runs: tuple, final_table_ids: frozenset
) -> Sequence:
    return Sequence(
        sequence_id=uuid4(),
        organization_id=TENANT_ID,
        dataset_workspace_id=WORKSPACE_ID,
        raw_table_reference=_connector_table(),
        created_at=BASE,
        updated_at=BASE,
        thread_id=uuid4(),
        steps=steps,
        prepared_tables=prepared_tables,
        runs=runs,
        final_table_ids=final_table_ids,
    )


def test_raw_table_label_uses_the_qualified_source_table_name() -> None:
    assert raw_table_label(_connector_table()) == "clickathon.orders"


def test_raw_table_label_uses_the_storage_locator_for_an_uploaded_table() -> None:
    reference = DatasetTableVersionReference(
        storage_locator="s3://bucket/orders.parquet", file_format="parquet"
    )
    assert raw_table_label(reference) == "s3://bucket/orders.parquet"


def test_a_failed_run_anchors_to_the_latest_prior_prepared_table() -> None:
    table_a = uuid4()
    table_b = uuid4()
    prepared_tables = (
        _prepared_table(
            prepared_table_id=table_a, step_id=uuid4(), parent=None, created_at=BASE
        ),
        _prepared_table(
            prepared_table_id=table_b,
            step_id=uuid4(),
            parent=table_a,
            created_at=BASE + timedelta(minutes=1),
        ),
    )
    run = SequenceRun(
        run_id=uuid4(),
        sequence_id=uuid4(),
        organization_id=TENANT_ID,
        step_id=uuid4(),
        outcome=SequenceRunFailed(
            reason=SequenceExecutionFailureReason.DATA_INCOMPATIBLE, detail="bad cast"
        ),
        attempted_at=BASE + timedelta(minutes=5),
    )
    assert anchor_for_failed_run(prepared_tables, run) == table_b


def test_a_failed_run_before_any_prepared_table_anchors_to_the_raw_table() -> None:
    run = SequenceRun(
        run_id=uuid4(),
        sequence_id=uuid4(),
        organization_id=TENANT_ID,
        step_id=uuid4(),
        outcome=SequenceRunFailed(
            reason=SequenceExecutionFailureReason.UNKNOWN_TABLE, detail="no such table"
        ),
        attempted_at=BASE,
    )
    assert anchor_for_failed_run((), run) is None


def test_build_graph_view_reports_a_linear_sequence() -> None:
    table_id = uuid4()
    step_id = uuid4()
    prepared_tables = (
        _prepared_table(
            prepared_table_id=table_id, step_id=step_id, parent=None, created_at=BASE
        ),
    )
    steps = (
        _step(
            step_id=step_id,
            produced_table_id=table_id,
            input_id=None,
            created_at=BASE,
        ),
    )
    sequence = _sequence(
        steps=steps,
        prepared_tables=prepared_tables,
        runs=(),
        final_table_ids=frozenset({table_id}),
    )

    view = build_graph_view(sequence)

    assert view.origin is SequenceOrigin.MANUAL
    assert view.raw_table_label == "clickathon.orders"
    assert len(view.steps) == 1
    assert len(view.prepared_tables) == 1
    assert view.prepared_tables[0].is_final is True
    assert view.failed_runs == ()


def test_build_graph_view_reports_a_chat_origin_sequence_with_no_thread() -> None:
    sequence = Sequence(
        sequence_id=uuid4(),
        organization_id=TENANT_ID,
        dataset_workspace_id=WORKSPACE_ID,
        raw_table_reference=_connector_table(),
        created_at=BASE,
        updated_at=BASE,
        thread_id=None,
    )
    assert build_graph_view(sequence).origin is SequenceOrigin.CHAT


def test_build_graph_view_includes_a_failed_run_as_its_own_entry() -> None:
    run = SequenceRun(
        run_id=uuid4(),
        sequence_id=uuid4(),
        organization_id=TENANT_ID,
        step_id=uuid4(),
        outcome=SequenceRunFailed(
            reason=SequenceExecutionFailureReason.CATALOG_VIOLATION, detail="bad op"
        ),
        attempted_at=BASE + timedelta(minutes=1),
    )
    sequence = _sequence(
        steps=(), prepared_tables=(), runs=(run,), final_table_ids=frozenset()
    )

    view = build_graph_view(sequence)

    assert len(view.failed_runs) == 1
    assert view.failed_runs[0].anchor_prepared_table_id is None
    assert (
        view.failed_runs[0].failure_reason
        is SequenceExecutionFailureReason.CATALOG_VIOLATION
    )


def test_build_graph_view_ignores_succeeded_runs() -> None:
    table_id = uuid4()
    run = SequenceRun(
        run_id=uuid4(),
        sequence_id=uuid4(),
        organization_id=TENANT_ID,
        step_id=uuid4(),
        outcome=SequenceRunSucceeded(produced_table_id=table_id),
        attempted_at=BASE,
    )
    sequence = _sequence(
        steps=(), prepared_tables=(), runs=(run,), final_table_ids=frozenset()
    )
    assert build_graph_view(sequence).failed_runs == ()


def test_build_preview_returns_columns_row_count_and_no_sample_rows() -> None:
    table_id = uuid4()
    step_id = uuid4()
    prepared_tables = (
        _prepared_table(
            prepared_table_id=table_id,
            step_id=step_id,
            parent=None,
            created_at=BASE,
            row_count=42,
            columns=("id", "email"),
        ),
    )
    steps = (
        _step(
            step_id=step_id,
            produced_table_id=table_id,
            input_id=None,
            created_at=BASE,
        ),
    )
    sequence = _sequence(
        steps=steps,
        prepared_tables=prepared_tables,
        runs=(),
        final_table_ids=frozenset({table_id}),
    )

    preview = build_preview(sequence, table_id)

    assert preview.row_count == 42
    assert preview.columns == ("id", "email")
    assert preview.is_final is True
    assert preview.sample_rows is None
    assert isinstance(preview.produced_by, DropNullsParameters)


def test_build_preview_raises_for_an_unknown_prepared_table() -> None:
    sequence = _sequence(
        steps=(), prepared_tables=(), runs=(), final_table_ids=frozenset()
    )
    with pytest.raises(PreparedTableNotFoundError):
        build_preview(sequence, uuid4())
