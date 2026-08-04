"""What the sequence application accepts and returns.

Read models here are deliberately not the domain entities: a `Sequence`
carries the full domain lineage, but a `SequenceListItem` carries only what a
list row needs, and a `PreparedTablePreview` never carries more than a
Prepared Table's own persisted metadata (see its `sample_rows` field).
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from enum import StrEnum
from uuid import UUID

from zentra_domain_agent_execution import SequenceExecutionFailureReason
from zentra_domain_sequence import RawTableReference, SequenceOperation


class Role(StrEnum):
    OWNER = "owner"
    ADMIN = "admin"
    MEMBER = "member"
    VIEWER = "viewer"


class SequenceOrigin(StrEnum):
    """How a Sequence came to exist.

    Derived, not stored: a Sequence created with a `thread_id` came from the
    manual "New Sequence" flow, which always links one at creation. Phase 5's
    auto-create-from-chat path will produce the other branch without a schema
    change.
    """

    MANUAL = "manual"
    CHAT = "chat"


@dataclass(frozen=True, slots=True)
class AuthenticatedActor:
    user_id: UUID
    organization_id: UUID
    role: Role


class PermissionDeniedError(PermissionError):
    pass


class SequenceNotFoundError(LookupError):
    pass


class PreparedTableNotFoundError(LookupError):
    pass


class RawTableNotFoundError(LookupError):
    """The Raw Table a manual create requested does not exist for this Organization."""


@dataclass(frozen=True, slots=True)
class SequenceListItem:
    sequence_id: UUID
    thread_id: UUID | None
    origin: SequenceOrigin
    raw_table: RawTableReference
    raw_table_label: str
    step_count: int
    final_table_count: int
    failed_run_count: int
    created_at: datetime
    updated_at: datetime


@dataclass(frozen=True, slots=True)
class SequenceSlice:
    dataset_workspace_id: UUID
    items: tuple[SequenceListItem, ...]


@dataclass(frozen=True, slots=True)
class SequenceStepView:
    step_id: UUID
    operation: SequenceOperation
    input_prepared_table_id: UUID | None
    produced_table_id: UUID
    created_at: datetime


@dataclass(frozen=True, slots=True)
class PreparedTableView:
    prepared_table_id: UUID
    step_id: UUID
    parent_prepared_table_id: UUID | None
    row_count: int
    columns: tuple[str, ...]
    created_at: datetime
    is_final: bool


@dataclass(frozen=True, slots=True)
class FailedRunView:
    """A failed Sequence Run, positioned on the graph by a derived anchor.

    `anchor_prepared_table_id` is display placement, not recorded lineage —
    see `lineage.anchor_for_failed_run`. `None` anchors to the Raw Table.
    """

    run_id: UUID
    attempted_at: datetime
    failure_reason: SequenceExecutionFailureReason
    failure_detail: str
    anchor_prepared_table_id: UUID | None


@dataclass(frozen=True, slots=True)
class SequenceGraphView:
    sequence_id: UUID
    organization_id: UUID
    dataset_workspace_id: UUID
    thread_id: UUID | None
    origin: SequenceOrigin
    raw_table: RawTableReference
    raw_table_label: str
    created_at: datetime
    updated_at: datetime
    steps: tuple[SequenceStepView, ...]
    prepared_tables: tuple[PreparedTableView, ...]
    failed_runs: tuple[FailedRunView, ...]


@dataclass(frozen=True, slots=True)
class PreparedTablePreview:
    """columns + row_count only: `sample_rows` stays `None` so the UI never
    sees more raw data than Data Steward itself is allowed to read."""

    prepared_table_id: UUID
    step_id: UUID
    row_count: int
    columns: tuple[str, ...]
    is_final: bool
    created_at: datetime
    produced_by: SequenceOperation
    sample_rows: None = None
