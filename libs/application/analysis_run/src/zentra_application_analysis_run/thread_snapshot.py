from __future__ import annotations

from uuid import UUID

from zentra_domain_analysis_run import (
    TERMINAL_STATUSES,
    Group,
    AnalysisRun,
    AnalysisRunStatus,
    AnalysisRunThread,
    ThreadMessage,
    ThreadStatus,
)

from .dto import AuthenticatedActor, Role, UsageSummary
from .thread_dto import (
    RoutingResult,
    ThreadDetail,
    ThreadAnalysisRunSummary,
    ThreadMessageDetail,
    ThreadNotFoundError,
)

THREAD_MUTATOR_ROLES = frozenset({Role.OWNER, Role.ADMIN, Role.MEMBER})
EMPTY_USAGE = UsageSummary()


def require_group(group: Group | None) -> Group:
    # Groups own Chat Sessions directly now -- there is no Project layer
    # between them (ADR-0028). `project_id` on Thread/AnalysisRunThread
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
    thread: AnalysisRunThread,
    messages: tuple[ThreadMessage, ...],
    analysis_run_id: UUID | None,
    routing: RoutingResult | None,
    actor: AuthenticatedActor,
    *,
    analysis_runs: tuple[AnalysisRun, ...] = (),
    analysis_run_summaries: tuple[ThreadAnalysisRunSummary, ...] = (),
    event_cursor: int = 0,
    usage: UsageSummary = EMPTY_USAGE,
) -> ThreadDetail:
    can_mutate = actor.role in THREAD_MUTATOR_ROLES
    is_archived = thread.status is ThreadStatus.ARCHIVED
    latest = analysis_runs[-1] if analysis_runs else None
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
        analysis_run_id=analysis_run_id,
        routing=routing,
        # A follow-up is always accepted regardless of the latest
        # AnalysisRun's status -- the composer is never blocked by an
        # in-flight Analysis Run (ADR-0028's follow-up-hard-block removal).
        # Draft or Active are the only statuses `append()` actually accepts;
        # Archived is refused there and `can_append_message` must agree.
        can_append_message=can_mutate and not is_archived,
        can_archive=can_mutate and not is_archived,
        can_restore=can_mutate and is_archived,
        can_delete=(
            can_mutate
            and thread.status is ThreadStatus.DRAFT
            and analysis_run_id is None
        ),
        analysis_runs=analysis_run_summaries
        or tuple(
            ThreadAnalysisRunSummary(
                analysis_run_id=value.analysis_run_id,
                sequence=value.thread_sequence or 0,
                status=value.status,
                parent_analysis_run_id=value.parent_analysis_run_id,
                retry_of_analysis_run_id=value.retry_of_analysis_run_id,
                created_at=value.created_at,
                updated_at=value.updated_at,
            )
            for value in analysis_runs
        ),
        event_cursor=event_cursor,
        can_cancel=(can_mutate and latest is not None and not latest_terminal),
        can_retry=(
            can_mutate
            and latest is not None
            and latest.status
            in {AnalysisRunStatus.FAILED, AnalysisRunStatus.CANCELLED}
        ),
        usage=usage,
    )
