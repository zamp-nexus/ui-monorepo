"""Wire shapes for the Sequence API.

Operations are re-expressed as `{kind, parameters}` rather than returning
the domain's own discriminated `SequenceOperation` union directly — that
union carries `Field(discriminator=...)` internals that have no business
leaking into a public contract, and the domain has already validated the
value by the time it reaches here.
"""

from __future__ import annotations

from datetime import datetime
from typing import Annotated, Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field
from pydantic.types import JsonValue
from zentra_application_sequence import (
    FailedRunView,
    PreparedTablePreview,
    PreparedTableView,
    SequenceGraphView,
    SequenceListItem,
    SequenceSlice,
    SequenceStepView,
)
from zentra_domain_sequence import (
    ConnectorSourceTableReference,
    DatasetTableVersionReference,
    RawTableReference,
    SequenceOperation,
)


class ConnectorSourceTableRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    kind: Literal["connector_source_table"] = "connector_source_table"
    catalog_version_id: str = Field(min_length=1)
    #: Qualified as `database.table` — the same shape a ClickHouse `remote()`
    #: call needs, so a typo here fails at creation instead of at Data
    #: Steward's first `unknown_table` execution failure.
    source_table_name: str = Field(min_length=1)


class DatasetTableVersionRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    kind: Literal["dataset_table_version"] = "dataset_table_version"
    storage_locator: str = Field(min_length=1)
    file_format: Literal["csv", "parquet"]


RawTableRequest = Annotated[
    ConnectorSourceTableRequest | DatasetTableVersionRequest,
    Field(discriminator="kind"),
]


def raw_table_request_to_domain(value: RawTableRequest) -> RawTableReference:
    if isinstance(value, ConnectorSourceTableRequest):
        return ConnectorSourceTableReference(
            catalog_version_id=value.catalog_version_id,
            source_table_name=value.source_table_name,
        )
    return DatasetTableVersionReference(
        storage_locator=value.storage_locator, file_format=value.file_format
    )


class CreateSequenceRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    project_id: UUID
    raw_table: RawTableRequest
    message: str = Field(min_length=1, max_length=4000)


class RawTableResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    kind: str
    label: str


class SequenceOperationResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    kind: str
    parameters: dict[str, JsonValue]

    @classmethod
    def from_operation(cls, operation: SequenceOperation) -> SequenceOperationResponse:
        return cls(
            kind=operation.kind,
            parameters=operation.model_dump(mode="json", exclude={"kind"}),
        )


class SequenceListItemResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    sequence_id: UUID
    thread_id: UUID | None
    origin: str
    raw_table: RawTableResponse
    step_count: int
    final_table_count: int
    failed_run_count: int
    created_at: datetime
    updated_at: datetime

    @classmethod
    def from_item(cls, item: SequenceListItem) -> SequenceListItemResponse:
        return cls(
            sequence_id=item.sequence_id,
            thread_id=item.thread_id,
            origin=item.origin.value,
            raw_table=RawTableResponse(
                kind=item.raw_table.kind, label=item.raw_table_label
            ),
            step_count=item.step_count,
            final_table_count=item.final_table_count,
            failed_run_count=item.failed_run_count,
            created_at=item.created_at,
            updated_at=item.updated_at,
        )


class SequenceListResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    dataset_workspace_id: UUID
    items: list[SequenceListItemResponse]

    @classmethod
    def from_slice(cls, value: SequenceSlice) -> SequenceListResponse:
        return cls(
            dataset_workspace_id=value.dataset_workspace_id,
            items=[SequenceListItemResponse.from_item(item) for item in value.items],
        )


class SequenceStepResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    step_id: UUID
    operation: SequenceOperationResponse
    input_prepared_table_id: UUID | None
    produced_table_id: UUID
    created_at: datetime

    @classmethod
    def from_view(cls, view: SequenceStepView) -> SequenceStepResponse:
        return cls(
            step_id=view.step_id,
            operation=SequenceOperationResponse.from_operation(view.operation),
            input_prepared_table_id=view.input_prepared_table_id,
            produced_table_id=view.produced_table_id,
            created_at=view.created_at,
        )


class PreparedTableResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    prepared_table_id: UUID
    step_id: UUID
    parent_prepared_table_id: UUID | None
    row_count: int
    columns: list[str]
    created_at: datetime
    is_final: bool

    @classmethod
    def from_view(cls, view: PreparedTableView) -> PreparedTableResponse:
        return cls(
            prepared_table_id=view.prepared_table_id,
            step_id=view.step_id,
            parent_prepared_table_id=view.parent_prepared_table_id,
            row_count=view.row_count,
            columns=list(view.columns),
            created_at=view.created_at,
            is_final=view.is_final,
        )


class FailedRunResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    run_id: UUID
    attempted_at: datetime
    failure_reason: str
    failure_detail: str
    anchor_prepared_table_id: UUID | None

    @classmethod
    def from_view(cls, view: FailedRunView) -> FailedRunResponse:
        return cls(
            run_id=view.run_id,
            attempted_at=view.attempted_at,
            failure_reason=view.failure_reason.value,
            failure_detail=view.failure_detail,
            anchor_prepared_table_id=view.anchor_prepared_table_id,
        )


class SequenceGraphResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    sequence_id: UUID
    dataset_workspace_id: UUID
    thread_id: UUID | None
    origin: str
    raw_table: RawTableResponse
    created_at: datetime
    updated_at: datetime
    steps: list[SequenceStepResponse]
    prepared_tables: list[PreparedTableResponse]
    failed_runs: list[FailedRunResponse]

    @classmethod
    def from_view(cls, view: SequenceGraphView) -> SequenceGraphResponse:
        return cls(
            sequence_id=view.sequence_id,
            dataset_workspace_id=view.dataset_workspace_id,
            thread_id=view.thread_id,
            origin=view.origin.value,
            raw_table=RawTableResponse(
                kind=view.raw_table.kind, label=view.raw_table_label
            ),
            created_at=view.created_at,
            updated_at=view.updated_at,
            steps=[SequenceStepResponse.from_view(step) for step in view.steps],
            prepared_tables=[
                PreparedTableResponse.from_view(table)
                for table in view.prepared_tables
            ],
            failed_runs=[
                FailedRunResponse.from_view(run) for run in view.failed_runs
            ],
        )


class PreparedTablePreviewResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    prepared_table_id: UUID
    step_id: UUID
    row_count: int
    columns: list[str]
    is_final: bool
    created_at: datetime
    produced_by: SequenceOperationResponse
    #: Always `None`: a Sequence preview never shows more raw data than Data
    #: Steward itself is allowed to read. See docs/adr for the decision.
    sample_rows: None = None

    @classmethod
    def from_preview(
        cls, preview: PreparedTablePreview
    ) -> PreparedTablePreviewResponse:
        return cls(
            prepared_table_id=preview.prepared_table_id,
            step_id=preview.step_id,
            row_count=preview.row_count,
            columns=list(preview.columns),
            is_final=preview.is_final,
            created_at=preview.created_at,
            produced_by=SequenceOperationResponse.from_operation(preview.produced_by),
        )
