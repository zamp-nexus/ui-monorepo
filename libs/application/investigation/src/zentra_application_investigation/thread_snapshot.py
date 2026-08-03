from __future__ import annotations

from uuid import UUID

from zentra_domain_investigation import (
    TERMINAL_STATUSES,
    Group,
    Investigation,
    InvestigationStatus,
    InvestigationThread,
    ThreadMessage,
    ThreadStatus,
)

from .dto import AuthenticatedActor, Role, UsageSummary
from .thread_dto import (
    RoutingResult,
    ThreadDetail,
    ThreadInvestigationSummary,
    ThreadMessageDetail,
    ThreadNotFoundError,
)

THREAD_MUTATOR_ROLES = frozenset({Role.OWNER, Role.ADMIN, Role.MEMBER})
EMPTY_USAGE = UsageSummary()


def require_group(group: Group | None) -> Group:
    # Groups own Chat Sessions directly now -- there is no Project layer
    # between them (ADR-0028). `project_id` on Thread/InvestigationThread
    # still names the parameter (that rename is deferred), but the value it
    # carries identifies a Group.
    if group is None:
        raise ThreadNotFoundError("Group was not found")
    return group


def validate_page_size(limit: int, maximum: int) -> int:
    if limit < 1 or limit > maximum:
        raise ValueError(f"Page size must be between 1 and {maximum}")
    return limit


def build_thread_detail(
    thread: InvestigationThread,
    messages: tuple[ThreadMessage, ...],
    investigation_id: UUID | None,
    routing: RoutingResult | None,
    actor: AuthenticatedActor,
    *,
    investigations: tuple[Investigation, ...] = (),
    investigation_summaries: tuple[ThreadInvestigationSummary, ...] = (),
    event_cursor: int = 0,
    usage: UsageSummary = EMPTY_USAGE,
) -> ThreadDetail:
    can_mutate = actor.role in THREAD_MUTATOR_ROLES
    is_archived = thread.status is ThreadStatus.ARCHIVED
    latest = investigations[-1] if investigations else None
    latest_terminal = latest is not None and latest.status in TERMINAL_STATUSES
    return ThreadDetail(
        thread_id=thread.thread_id,
        project_id=thread.project_id,
        title=thread.title,
        status=thread.status,
        created_at=thread.created_at,
        updated_at=thread.updated_at,
        latest_activity_at=thread.latest_activity_at,
        messages=tuple(
            ThreadMessageDetail(
                message_id=message.message_id,
                kind=message.kind,
                content=message.content,
                created_at=message.created_at,
                authored_by_user=message.author_id is not None,
            )
            for message in messages
        ),
        investigation_id=investigation_id,
        routing=routing,
        # A follow-up is always accepted regardless of the latest
        # Investigation's status -- the composer is never blocked by an
        # in-flight Analysis Run (ADR-0028's follow-up-hard-block removal).
        # Draft or Active are the only statuses `append()` actually accepts;
        # Archived is refused there and `can_append_message` must agree.
        can_append_message=can_mutate and not is_archived,
        can_archive=can_mutate and not is_archived,
        can_restore=can_mutate and is_archived,
        can_delete=(
            can_mutate
            and thread.status is ThreadStatus.DRAFT
            and investigation_id is None
        ),
        investigations=investigation_summaries
        or tuple(
            ThreadInvestigationSummary(
                investigation_id=value.investigation_id,
                sequence=value.thread_sequence or 0,
                status=value.status,
                parent_investigation_id=value.parent_investigation_id,
                retry_of_investigation_id=value.retry_of_investigation_id,
                created_at=value.created_at,
                updated_at=value.updated_at,
            )
            for value in investigations
        ),
        event_cursor=event_cursor,
        can_cancel=(can_mutate and latest is not None and not latest_terminal),
        can_retry=(
            can_mutate
            and latest is not None
            and latest.status
            in {InvestigationStatus.FAILED, InvestigationStatus.CANCELLED}
        ),
        usage=usage,
    )
