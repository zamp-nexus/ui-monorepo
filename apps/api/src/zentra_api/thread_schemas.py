from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field
from zentra_application_investigation import (
    RoutingResult,
    ThreadDetail,
    ThreadMessageDetail,
    ThreadPage,
    ThreadSummary,
)


class ThreadMessageRequest(BaseModel):
    model_config = ConfigDict(
        extra="forbid",
        json_schema_extra={
            "examples": [
                {"message": ("Why did EU refunds increase from June to July 2026?")}
            ]
        },
    )

    message: str = Field(min_length=1, max_length=4_000)


class RoutingResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    disposition: str
    scenario_key: str | None
    canonical_question: str | None
    clarification: str | None
    suggestions: list[str]

    @classmethod
    def from_detail(cls, detail: RoutingResult) -> RoutingResponse:
        return cls(
            disposition=detail.disposition.value,
            scenario_key=detail.scenario_key,
            canonical_question=detail.canonical_question,
            clarification=detail.clarification,
            suggestions=list(detail.suggestions),
        )


class ThreadMessageResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    message_id: UUID
    kind: str
    content: str
    created_at: datetime
    authored_by_user: bool

    @classmethod
    def from_detail(cls, detail: ThreadMessageDetail) -> ThreadMessageResponse:
        return cls(
            message_id=detail.message_id,
            kind=detail.kind.value,
            content=detail.content,
            created_at=detail.created_at,
            authored_by_user=detail.authored_by_user,
        )


class ThreadActionsResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    can_append_message: bool
    can_archive: bool
    can_restore: bool
    can_delete: bool


class ThreadResponse(BaseModel):
    model_config = ConfigDict(
        extra="forbid",
        json_schema_extra={
            "examples": [
                {
                    "thread_id": "43000000-0000-0000-0000-000000000001",
                    "project_id": "42000000-0000-0000-0000-000000000001",
                    "title": "How is the business doing?",
                    "status": "draft",
                    "created_at": "2026-08-01T09:00:00Z",
                    "updated_at": "2026-08-01T09:00:00Z",
                    "latest_activity_at": "2026-08-01T09:00:00Z",
                    "messages": [],
                    "investigation_id": None,
                    "routing": {
                        "disposition": "unsupported",
                        "scenario_key": None,
                        "canonical_question": None,
                        "clarification": "Please choose a supported question.",
                        "suggestions": [],
                    },
                    "actions": {
                        "can_append_message": True,
                        "can_archive": True,
                        "can_restore": False,
                        "can_delete": True,
                    },
                }
            ]
        },
    )

    thread_id: UUID
    project_id: UUID
    title: str
    status: str
    created_at: datetime
    updated_at: datetime
    latest_activity_at: datetime
    messages: list[ThreadMessageResponse]
    investigation_id: UUID | None
    routing: RoutingResponse | None
    actions: ThreadActionsResponse

    @classmethod
    def from_detail(cls, detail: ThreadDetail) -> ThreadResponse:
        return cls(
            thread_id=detail.thread_id,
            project_id=detail.project_id,
            title=detail.title,
            status=detail.status.value,
            created_at=detail.created_at,
            updated_at=detail.updated_at,
            latest_activity_at=detail.latest_activity_at,
            messages=[
                ThreadMessageResponse.from_detail(message)
                for message in detail.messages
            ],
            investigation_id=detail.investigation_id,
            routing=(
                RoutingResponse.from_detail(detail.routing) if detail.routing else None
            ),
            actions=ThreadActionsResponse(
                can_append_message=detail.can_append_message,
                can_archive=detail.can_archive,
                can_restore=detail.can_restore,
                can_delete=detail.can_delete,
            ),
        )


class ThreadSummaryResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    thread_id: UUID
    project_id: UUID
    title: str
    status: str
    latest_activity_at: datetime
    investigation_id: UUID | None

    @classmethod
    def from_detail(cls, detail: ThreadSummary) -> ThreadSummaryResponse:
        return cls(
            thread_id=detail.thread_id,
            project_id=detail.project_id,
            title=detail.title,
            status=detail.status.value,
            latest_activity_at=detail.latest_activity_at,
            investigation_id=detail.investigation_id,
        )


class ThreadPageResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    items: list[ThreadSummaryResponse]
    next_cursor: str | None

    @classmethod
    def from_detail(cls, detail: ThreadPage) -> ThreadPageResponse:
        return cls(
            items=[ThreadSummaryResponse.from_detail(item) for item in detail.items],
            next_cursor=detail.next_cursor,
        )
