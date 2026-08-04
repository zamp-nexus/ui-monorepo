"""Sequence: a Dataset Workspace-owned graph of typed transform steps.

`dataset_workspace_id` is a plain UUID column, not a foreign key: Data
Source (which will own Dataset Workspace) has no persisted schema yet — its
domain library is CONTEXT.md-only. Add the constraint once that table
exists; nothing here needs to change to add it later.

Final Table marking lives in its own join table (`sequence_final_tables`)
rather than a flag on `prepared_tables`, mirroring the domain model's own
choice to keep that state on the Sequence rather than stamped onto the
table it marks.
"""

from sqlalchemy import (
    JSON,
    TIMESTAMP,
    CheckConstraint,
    Column,
    ForeignKey,
    ForeignKeyConstraint,
    Index,
    Integer,
    Table,
    Text,
    UniqueConstraint,
    text,
)
from sqlalchemy.dialects.postgresql import UUID
from zentra_domain_sequence import SequenceOperationKind

from ._metadata import metadata


def _operation_kind_check() -> str:
    """The closed v1 typed operation catalog, as a CHECK body.

    Sorted so the emitted DDL is stable — an unordered frozenset would make
    every schema diff look like a change.
    """
    values = ", ".join(f"'{kind.value}'" for kind in sorted(SequenceOperationKind))
    return f"operation_kind IN ({values})"


sequences = Table(
    "sequences",
    metadata,
    Column(
        "sequence_id",
        UUID(as_uuid=True),
        primary_key=True,
        server_default=text("gen_random_uuid()"),
    ),
    Column(
        "organization_id",
        UUID(as_uuid=True),
        ForeignKey("organizations.organization_id", ondelete="CASCADE"),
        nullable=False,
    ),
    Column("dataset_workspace_id", UUID(as_uuid=True), nullable=False),
    # Nullable, no FK to threads: set at creation by the manual "New Sequence"
    # flow; left NULL for a future auto-create-from-chat path (Phase 5) until
    # a thread exists to link. No FK for the same cross-context reason
    # `dataset_workspace_id` has none — Investigation and Sequence stay free
    # to evolve independently.
    Column("thread_id", UUID(as_uuid=True)),
    Column("raw_table_kind", Text, nullable=False),
    Column("raw_table_payload", JSON, nullable=False),
    Column(
        "created_at",
        TIMESTAMP(timezone=True),
        nullable=False,
        server_default=text("now()"),
    ),
    Column(
        "updated_at",
        TIMESTAMP(timezone=True),
        nullable=False,
        server_default=text("now()"),
    ),
    UniqueConstraint(
        "sequence_id", "organization_id", name="uq_sequences_organization_identity"
    ),
    CheckConstraint(
        "raw_table_kind IN ('connector_source_table', 'dataset_table_version')",
        name="ck_sequences_raw_table_kind",
    ),
)
Index(
    "ix_sequences_workspace_activity",
    sequences.c.organization_id,
    sequences.c.dataset_workspace_id,
    sequences.c.updated_at.desc(),
    sequences.c.sequence_id.desc(),
)


sequence_steps = Table(
    "sequence_steps",
    metadata,
    Column(
        "step_id",
        UUID(as_uuid=True),
        primary_key=True,
        server_default=text("gen_random_uuid()"),
    ),
    Column("sequence_id", UUID(as_uuid=True), nullable=False),
    Column(
        "organization_id",
        UUID(as_uuid=True),
        ForeignKey("organizations.organization_id", ondelete="CASCADE"),
        nullable=False,
    ),
    Column("operation_kind", Text, nullable=False),
    Column("operation_parameters", JSON, nullable=False),
    # NULL input_reference_id means this step reads the Sequence's Raw
    # Table directly, matching the domain model's SequenceStep.input_reference.
    Column("input_reference_id", UUID(as_uuid=True)),
    # Informational only, not a foreign key: the Prepared Table row is
    # created in the same transaction and there is no ordering that avoids
    # one of the two tables temporarily lacking its counterpart's id.
    Column("produced_table_id", UUID(as_uuid=True), nullable=False),
    Column(
        "created_at",
        TIMESTAMP(timezone=True),
        nullable=False,
        server_default=text("now()"),
    ),
    ForeignKeyConstraint(
        ("sequence_id", "organization_id"),
        ("sequences.sequence_id", "sequences.organization_id"),
        name="fk_sequence_steps_sequence_organization",
        ondelete="CASCADE",
    ),
    UniqueConstraint(
        "step_id", "organization_id", name="uq_sequence_steps_organization_identity"
    ),
    CheckConstraint(_operation_kind_check(), name="ck_sequence_steps_operation_kind"),
)
Index(
    "ix_sequence_steps_sequence_created",
    sequence_steps.c.organization_id,
    sequence_steps.c.sequence_id,
    sequence_steps.c.created_at,
)


prepared_tables = Table(
    "prepared_tables",
    metadata,
    Column(
        "prepared_table_id",
        UUID(as_uuid=True),
        primary_key=True,
        server_default=text("gen_random_uuid()"),
    ),
    Column("sequence_id", UUID(as_uuid=True), nullable=False),
    Column("step_id", UUID(as_uuid=True), nullable=False),
    Column(
        "organization_id",
        UUID(as_uuid=True),
        ForeignKey("organizations.organization_id", ondelete="CASCADE"),
        nullable=False,
    ),
    # NULL means this table was produced directly from the Sequence's Raw
    # Table; otherwise it is the prior Prepared Table this one was derived
    # from — the domain model's PreparedTable.parent_table_reference.
    Column("parent_prepared_table_id", UUID(as_uuid=True)),
    Column("row_count", Integer, nullable=False),
    Column("columns", JSON, nullable=False),
    Column(
        "created_at",
        TIMESTAMP(timezone=True),
        nullable=False,
        server_default=text("now()"),
    ),
    ForeignKeyConstraint(
        ("sequence_id", "organization_id"),
        ("sequences.sequence_id", "sequences.organization_id"),
        name="fk_prepared_tables_sequence_organization",
        ondelete="CASCADE",
    ),
    ForeignKeyConstraint(
        ("step_id", "organization_id"),
        ("sequence_steps.step_id", "sequence_steps.organization_id"),
        name="fk_prepared_tables_step_organization",
        ondelete="CASCADE",
    ),
    ForeignKeyConstraint(
        ("parent_prepared_table_id", "organization_id"),
        ("prepared_tables.prepared_table_id", "prepared_tables.organization_id"),
        name="fk_prepared_tables_parent_organization",
    ),
    UniqueConstraint(
        "prepared_table_id",
        "organization_id",
        name="uq_prepared_tables_organization_identity",
    ),
    CheckConstraint("row_count >= 0", name="ck_prepared_tables_row_count"),
)
Index(
    "ix_prepared_tables_sequence_created",
    prepared_tables.c.organization_id,
    prepared_tables.c.sequence_id,
    prepared_tables.c.created_at,
)


sequence_runs = Table(
    "sequence_runs",
    metadata,
    Column(
        "run_id",
        UUID(as_uuid=True),
        primary_key=True,
        server_default=text("gen_random_uuid()"),
    ),
    Column("sequence_id", UUID(as_uuid=True), nullable=False),
    Column(
        "organization_id",
        UUID(as_uuid=True),
        ForeignKey("organizations.organization_id", ondelete="CASCADE"),
        nullable=False,
    ),
    # Informational only, not a foreign key: on a failed run, no
    # sequence_steps row with this id ever exists (see sequence.py's
    # domain rule — a SequenceStep is only recorded on success).
    Column("step_id", UUID(as_uuid=True), nullable=False),
    Column("outcome_kind", Text, nullable=False),
    Column("produced_table_id", UUID(as_uuid=True)),
    Column("failure_reason", Text),
    Column("failure_detail", Text),
    Column(
        "attempted_at",
        TIMESTAMP(timezone=True),
        nullable=False,
        server_default=text("now()"),
    ),
    ForeignKeyConstraint(
        ("sequence_id", "organization_id"),
        ("sequences.sequence_id", "sequences.organization_id"),
        name="fk_sequence_runs_sequence_organization",
        ondelete="CASCADE",
    ),
    CheckConstraint(
        "outcome_kind IN ('succeeded', 'failed')",
        name="ck_sequence_runs_outcome_kind",
    ),
    CheckConstraint(
        "(outcome_kind = 'succeeded' AND produced_table_id IS NOT NULL "
        " AND failure_reason IS NULL AND failure_detail IS NULL) "
        "OR "
        "(outcome_kind = 'failed' AND produced_table_id IS NULL "
        " AND failure_reason IS NOT NULL AND failure_detail IS NOT NULL)",
        name="ck_sequence_runs_typed_outcome",
    ),
)
Index(
    "ix_sequence_runs_sequence_attempted",
    sequence_runs.c.organization_id,
    sequence_runs.c.sequence_id,
    sequence_runs.c.attempted_at,
)


sequence_final_tables = Table(
    "sequence_final_tables",
    metadata,
    Column("sequence_id", UUID(as_uuid=True), primary_key=True),
    Column("prepared_table_id", UUID(as_uuid=True), primary_key=True),
    Column(
        "organization_id",
        UUID(as_uuid=True),
        ForeignKey("organizations.organization_id", ondelete="CASCADE"),
        nullable=False,
    ),
    Column(
        "marked_at",
        TIMESTAMP(timezone=True),
        nullable=False,
        server_default=text("now()"),
    ),
    ForeignKeyConstraint(
        ("sequence_id", "organization_id"),
        ("sequences.sequence_id", "sequences.organization_id"),
        name="fk_sequence_final_tables_sequence_organization",
        ondelete="CASCADE",
    ),
    ForeignKeyConstraint(
        ("prepared_table_id", "organization_id"),
        ("prepared_tables.prepared_table_id", "prepared_tables.organization_id"),
        name="fk_sequence_final_tables_table_organization",
        ondelete="CASCADE",
    ),
)
