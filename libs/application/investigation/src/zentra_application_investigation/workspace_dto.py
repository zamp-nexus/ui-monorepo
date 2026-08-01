from __future__ import annotations

import base64
import json
from dataclasses import dataclass
from datetime import datetime
from uuid import UUID


class WorkspaceNotFoundError(LookupError):
    pass


class WorkspaceConflictError(RuntimeError):
    pass


class WorkspaceNameConflictError(WorkspaceConflictError):
    pass


class WorkspaceCursorError(ValueError):
    pass


@dataclass(frozen=True, slots=True)
class WorkspaceCursor:
    updated_at: datetime
    resource_id: UUID

    def encode(self) -> str:
        payload = json.dumps(
            {"updated_at": self.updated_at.isoformat(), "id": str(self.resource_id)},
            separators=(",", ":"),
            sort_keys=True,
        ).encode()
        return base64.urlsafe_b64encode(payload).rstrip(b"=").decode()

    @classmethod
    def decode(cls, value: str) -> WorkspaceCursor:
        try:
            padded = value + "=" * (-len(value) % 4)
            payload = json.loads(base64.urlsafe_b64decode(padded).decode())
            return cls(
                updated_at=datetime.fromisoformat(payload["updated_at"]),
                resource_id=UUID(payload["id"]),
            )
        except (
            KeyError,
            TypeError,
            ValueError,
            UnicodeDecodeError,
            json.JSONDecodeError,
        ) as error:
            raise WorkspaceCursorError("The workspace cursor is invalid") from error


@dataclass(frozen=True, slots=True)
class GroupDetail:
    group_id: UUID
    name: str
    created_at: datetime
    updated_at: datetime
    archived_at: datetime | None
    can_manage: bool


@dataclass(frozen=True, slots=True)
class ProjectDetail:
    project_id: UUID
    group_id: UUID
    name: str
    created_at: datetime
    updated_at: datetime
    archived_at: datetime | None
    can_manage: bool


@dataclass(frozen=True, slots=True)
class WorkspacePage[T]:
    items: tuple[T, ...]
    next_cursor: str | None
