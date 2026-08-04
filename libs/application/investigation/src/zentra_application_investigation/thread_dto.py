from __future__ import annotations

import base64
import json
from dataclasses import dataclass
from datetime import UTC, datetime
from enum import StrEnum
from uuid import UUID

from zentra_domain_agent_execution import OutcomeSignal
from zentra_domain_investigation import (
    DraftFinding,
    EvidenceCitation,
    Finding,
    HumanApproval,
    InvestigationStatus,
    ThreadMessage,
    ThreadMessageKind,
    ThreadStatus,
)

from .dto import AuditDelivery, UsageSummary


class ThreadNotFoundError(LookupError):
    pass


class ThreadConflictError(RuntimeError):
    pass


class ThreadCursorError(ValueError):
    pass


class RoutingDisposition(StrEnum):
    RESOLVED = "resolved"
    # Read-compatibility only (ADR-0023). Routing matched free text against two
    # governed scenarios and refused everything else; an organization's questions are
    # its own now, so nothing produces these. Threads and Work Feed events
    # written before that carry them and must stay readable.
    AMBIGUOUS = "ambiguous"
    UNSUPPORTED = "unsupported"
    # A message that is not a business question at all -- a greeting, thanks,
    # or "what can you do" -- rather than one Intake could not resolve.
    # Routed to the Conversational Agent instead of a router-clarification
    # message (ADR-0033's `assistant_reply` kind).
    NOT_ANALYTICAL = "not_analytical"


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
class ThreadInvestigationSummary:
    investigation_id: UUID
    sequence: int
    status: InvestigationStatus
    parent_investigation_id: UUID | None
    retry_of_investigation_id: UUID | None
    created_at: datetime
    updated_at: datetime
    question: str = ""
    # See InvestigationDetail.scenario_key — read-compatibility only.
    scenario_key: str | None = None
    version: int = 0
    evaluation_attempts: int = 0
    finished_at: datetime | None = None
    finding: Finding | None = None
    draft_finding: DraftFinding | None = None
    outcome: OutcomeSignal | None = None
    approval: HumanApproval | None = None
    citations: tuple[EvidenceCitation, ...] = ()
    audit_delivery: AuditDelivery = AuditDelivery.COMPLETE
    usage: UsageSummary = UsageSummary()
    can_decide_approval: bool = False


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
    investigations: tuple[ThreadInvestigationSummary, ...] = ()
    event_cursor: int = 0
    can_cancel: bool = False
    can_retry: bool = False
    usage: UsageSummary = UsageSummary()


@dataclass(frozen=True, slots=True)
class ThreadStreamRouting:
    """First event of a streaming turn: routing has resolved, the user's
    message is durably persisted. Everything a caller needs to seed a cache
    immediately, before any reply text exists."""

    thread_id: UUID
    message_id: UUID
    investigation_id: UUID | None
    routing: RoutingResult


@dataclass(frozen=True, slots=True)
class ThreadStreamDelta:
    """One incremental chunk of a conversational reply in progress."""

    message_id: UUID
    text: str


@dataclass(frozen=True, slots=True)
class ThreadStreamMessage:
    """The conversational reply, fully generated and persisted."""

    message: ThreadMessage


@dataclass(frozen=True, slots=True)
class ThreadStreamSnapshot:
    """Terminal event: the same detail a non-streaming call returns outright."""

    detail: ThreadDetail


@dataclass(frozen=True, slots=True)
class ThreadStreamError:
    """Terminal event: the reply failed after streaming had already begun.

    Never retried onto another provider once emitted -- see
    `RoutedModelClient.stream`'s docstring for why a mid-stream failure is a
    clean error rather than a silent retry.
    """

    message: str


ThreadStreamEvent = (
    ThreadStreamRouting | ThreadStreamDelta | ThreadStreamMessage | ThreadStreamSnapshot
    | ThreadStreamError
)


@dataclass(frozen=True, slots=True)
class ThreadPage:
    items: tuple[ThreadSummary, ...]
    next_cursor: str | None


@dataclass(frozen=True, slots=True)
class ThreadSlice:
    items: tuple[ThreadSummary, ...]
    next_cursor: ThreadCursor | None
