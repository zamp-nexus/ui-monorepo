from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field
from zentra_application_investigation import GroupDetail


class OrganizationNameRequest(BaseModel):
    model_config = ConfigDict(
        extra="forbid",
        json_schema_extra={"examples": [{"name": "Finance Operations"}]},
    )

    name: str = Field(min_length=1, max_length=100)


class GroupResponse(BaseModel):
    model_config = ConfigDict(
        extra="forbid",
        json_schema_extra={
            "examples": [
                {
                    "group_id": "41000000-0000-0000-0000-000000000001",
                    "name": "Finance Operations",
                    "created_at": "2026-08-01T09:00:00Z",
                    "updated_at": "2026-08-01T09:00:00Z",
                    "archived_at": None,
                    "can_manage": True,
                }
            ]
        },
    )

    group_id: UUID
    name: str
    created_at: datetime
    updated_at: datetime
    archived_at: datetime | None
    can_manage: bool

    @classmethod
    def from_detail(cls, detail: GroupDetail) -> GroupResponse:
        return cls(
            group_id=detail.group_id,
            name=detail.name,
            created_at=detail.created_at,
            updated_at=detail.updated_at,
            archived_at=detail.archived_at,
            can_manage=detail.can_manage,
        )


class GroupPageResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    items: list[GroupResponse]
    next_cursor: str | None
