"""Turning a Thread's messages into the question an Investigation will answer.

This was a keyword table matching two governed scenarios; anything else was
refused before an agent ran (ADR-0023). A tenant's questions are its own, so
there is nothing here to match against: the question a user asked is the
question the pipeline gets.

Kept as a seam rather than inlined into `thread_service`. Whether a question is
answerable is a judgement the Cube Analyst makes against the tenant's live
catalog, and when that check moves ahead of the pipeline it belongs here.
"""

from __future__ import annotations

from zentra_domain_investigation import ThreadMessage, ThreadMessageKind

from .thread_dto import RoutingDisposition, RoutingResult

_USER_AUTHORED = frozenset(
    {ThreadMessageKind.USER_QUESTION, ThreadMessageKind.USER_CLARIFICATION}
)


def _resolved(question: str) -> RoutingResult:
    return RoutingResult(
        disposition=RoutingDisposition.RESOLVED,
        scenario_key=None,
        canonical_question=question,
        clarification=None,
        suggestions=(),
    )


def route_governed_question(value: str) -> RoutingResult:
    return _resolved(value)


def route_draft_messages(messages: tuple[ThreadMessage, ...]) -> RoutingResult:
    """The question a Draft Thread is asking, read from its own messages.

    A Draft Thread only exists on the read path now — nothing routes into one —
    but one created before ADR-0023 can still receive a clarification, and its
    question is the latest thing its author actually said.
    """
    authored = [
        message.content for message in messages if message.kind in _USER_AUTHORED
    ]
    return _resolved(authored[-1] if authored else "")


def deterministic_thread_title(value: str) -> str:
    title = " ".join(value.split())
    return title if len(title) <= 80 else f"{title[:79].rstrip()}…"
