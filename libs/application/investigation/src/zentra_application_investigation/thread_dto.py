from __future__ import annotations

import base64
import json
from dataclasses import dataclass
from datetime import UTC, datetime
from enum import StrEnum
from uuid import UUID

from zentra_domain_investigation import ThreadMessageKind, ThreadStatus


class ThreadNotFoundError(LookupError):
    pass


class ThreadConflictError(RuntimeError):
    pass


class ThreadCursorError(ValueError):
    pass


class RoutingDisposition(StrEnum):
    RESOLVED = "resolved"
    AMBIGUOUS = "ambiguous"
    UNSUPPORTED = "unsupported"


@dataclass(frozen=True, slots=True)
class ThreadCursor:
    activity_at: datetime
    thread_id: UUID

    def encode(self) -> str:
        payload = json.dumps(
            {
                "activity_at": self.activity_at.isoformat(),
                "thread_id": str(self.thread_id),
            },
            separators=(",", ":"),
            sort_keys=True,
        ).encode()
        return base64.urlsafe_b64encode(payload).rstrip(b"=").decode()

    @classmethod
    def decode(cls, value: str) -> ThreadCursor:
        try:
            padded = value + "=" * (-len(value) % 4)
            payload = json.loads(base64.urlsafe_b64decode(padded).decode())
            activity_at = datetime.fromisoformat(payload["activity_at"])
            if activity_at.tzinfo is None or activity_at.utcoffset() is None:
                raise ValueError("Cursor timestamps must include a UTC offset")
            return cls(
                activity_at=activity_at.astimezone(UTC),
                thread_id=UUID(payload["thread_id"]),
            )
        except (
            KeyError,
            TypeError,
            ValueError,
            UnicodeDecodeError,
            json.JSONDecodeError,
        ) as error:
            raise ThreadCursorError("The Thread cursor is invalid") from error


@dataclass(frozen=True, slots=True)
class RoutingResult:
    disposition: RoutingDisposition
    scenario_key: str | None
    canonical_question: str | None
    clarification: str | None
    suggestions: tuple[str, ...]


@dataclass(frozen=True, slots=True)
class ThreadMessageDetail:
    message_id: UUID
    kind: ThreadMessageKind
    content: str
    created_at: datetime
    authored_by_user: bool


@dataclass(frozen=True, slots=True)
class ThreadSummary:
    thread_id: UUID
    project_id: UUID
    title: str
    status: ThreadStatus
    latest_activity_at: datetime
    investigation_id: UUID | None


@dataclass(frozen=True, slots=True)
class ThreadDetail:
    thread_id: UUID
    project_id: UUID
    title: str
    status: ThreadStatus
    created_at: datetime
    updated_at: datetime
    latest_activity_at: datetime
    messages: tuple[ThreadMessageDetail, ...]
    investigation_id: UUID | None
    routing: RoutingResult | None
    can_append_message: bool
    can_archive: bool
    can_restore: bool
    can_delete: bool


@dataclass(frozen=True, slots=True)
class ThreadPage:
    items: tuple[ThreadSummary, ...]
    next_cursor: str | None


@dataclass(frozen=True, slots=True)
class ThreadSlice:
    items: tuple[ThreadSummary, ...]
    next_cursor: ThreadCursor | None
