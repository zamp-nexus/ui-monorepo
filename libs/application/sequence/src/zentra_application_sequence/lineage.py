"""Pure functions turning a persisted `Sequence` into read models.

No I/O here — every function takes what it needs as an argument, which is
what makes `graph-layout.ts` on the frontend, and these, independently
unit-testable against the same fixtures.
"""

from __future__ import annotations

from uuid import UUID

from zentra_domain_sequence import (
    ConnectorSourceTableReference,
    PreparedTable,
    RawTableReference,
    Sequence,
    SequenceRun,
    SequenceRunFailed,
    SequenceStep,
)

from .dto import (
    FailedRunView,
    PreparedTableNotFoundError,
    PreparedTablePreview,
    PreparedTableView,
    SequenceGraphView,
    SequenceOrigin,
    SequenceStepView,
)


def raw_table_label(reference: RawTableReference) -> str:
    """The single place every surface (list row, detail header, root node)
    gets a Raw Table's display name from, so they can never disagree."""
    if isinstance(reference, ConnectorSourceTableReference):
        return reference.source_table_name
    return reference.storage_locator


def anchor_for_failed_run(
    prepared_tables: tuple[PreparedTable, ...], run: SequenceRun
) -> UUID | None:
    """Where a failed attempt is shown on the canvas.

    A display heuristic, not recorded lineage: `sequence_runs` carries no
    input reference, because nothing yet writes one. The anchor is the
    Prepared Table with the latest `created_at` strictly before the run was
    attempted — the table the failed step was most likely applied to — or
    `None` (the Raw Table) if none preceded it.
    """
    candidates = [
        table for table in prepared_tables if table.created_at < run.attempted_at
    ]
    if not candidates:
        return None
    return max(candidates, key=lambda table: table.created_at).prepared_table_id


def build_graph_view(sequence: Sequence) -> SequenceGraphView:
    steps = tuple(
        SequenceStepView(
            step_id=step.step_id,
            operation=step.operation,
            input_prepared_table_id=(
                step.input_reference.reference_id
                if step.input_reference is not None
                else None
            ),
            produced_table_id=step.produced_table_id,
            created_at=step.created_at,
        )
        for step in sequence.steps
    )
    prepared_tables = tuple(
        PreparedTableView(
            prepared_table_id=table.prepared_table_id,
            step_id=table.step_id,
            parent_prepared_table_id=(
                table.parent_table_reference.reference_id
                if table.parent_table_reference is not None
                else None
            ),
            row_count=table.row_count,
            columns=table.columns,
            created_at=table.created_at,
            is_final=table.prepared_table_id in sequence.final_table_ids,
        )
        for table in sequence.prepared_tables
    )
    failed_runs = tuple(
        FailedRunView(
            run_id=run.run_id,
            attempted_at=run.attempted_at,
            failure_reason=run.outcome.reason,
            failure_detail=run.outcome.detail,
            anchor_prepared_table_id=anchor_for_failed_run(
                sequence.prepared_tables, run
            ),
        )
        for run in sequence.runs
        if isinstance(run.outcome, SequenceRunFailed)
    )
    reference = sequence.raw_table_reference
    return SequenceGraphView(
        sequence_id=sequence.sequence_id,
        organization_id=sequence.organization_id,
        dataset_workspace_id=sequence.dataset_workspace_id,
        thread_id=sequence.thread_id,
        origin=(
            SequenceOrigin.MANUAL
            if sequence.thread_id is not None
            else SequenceOrigin.CHAT
        ),
        raw_table=reference,
        raw_table_label=raw_table_label(reference),
        created_at=sequence.created_at,
        updated_at=sequence.updated_at,
        steps=steps,
        prepared_tables=prepared_tables,
        failed_runs=failed_runs,
    )


def build_preview(
    sequence: Sequence, prepared_table_id: UUID
) -> PreparedTablePreview:
    table = next(
        (
            candidate
            for candidate in sequence.prepared_tables
            if candidate.prepared_table_id == prepared_table_id
        ),
        None,
    )
    if table is None:
        raise PreparedTableNotFoundError(
            f"{prepared_table_id} is not a Prepared Table in this Sequence"
        )
    step = _step_for(sequence, table.step_id)
    return PreparedTablePreview(
        prepared_table_id=table.prepared_table_id,
        step_id=table.step_id,
        row_count=table.row_count,
        columns=table.columns,
        is_final=table.prepared_table_id in sequence.final_table_ids,
        created_at=table.created_at,
        produced_by=step.operation,
    )


def _step_for(sequence: Sequence, step_id: UUID) -> SequenceStep:
    for step in sequence.steps:
        if step.step_id == step_id:
            return step
    raise PreparedTableNotFoundError(
        f"No Sequence Step {step_id} found for this Prepared Table"
    )
