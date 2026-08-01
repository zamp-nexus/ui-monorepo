from __future__ import annotations

import re

from zentra_domain_investigation import ThreadMessage, ThreadMessageKind

from .dto import SCENARIOS, Scenario
from .thread_dto import RoutingDisposition, RoutingResult

_EU_REQUIREMENTS = (
    frozenset({"refund", "refunds"}),
    frozenset({"eu", "europe", "european"}),
    frozenset({"june"}),
    frozenset({"july"}),
)
_NA_REQUIREMENTS = (
    frozenset({"channel", "channels"}),
    frozenset({"north america", "na"}),
    frozenset({"revenue", "sales"}),
    frozenset({"october", "oct"}),
    frozenset({"november", "nov"}),
)


def _routing_tokens(value: str) -> set[str]:
    normalized = re.sub(r"[^a-z0-9]+", " ", value.casefold()).strip()
    tokens = set(normalized.split())
    if "north america" in normalized:
        tokens.add("north america")
    return tokens


def _matches(tokens: set[str], requirements: tuple[frozenset[str], ...]) -> bool:
    return all(tokens & requirement for requirement in requirements)


def _route_tokens(tokens: set[str]) -> RoutingResult:
    matches: list[Scenario] = []
    if _matches(tokens, _EU_REQUIREMENTS):
        matches.append(SCENARIOS["eu_refund_spike"])
    if _matches(tokens, _NA_REQUIREMENTS):
        matches.append(SCENARIOS["na_channel_growth"])
    suggestions = tuple(scenario.question for scenario in SCENARIOS.values())
    if len(matches) == 1:
        scenario = matches[0]
        return RoutingResult(
            disposition=RoutingDisposition.RESOLVED,
            scenario_key=scenario.key,
            canonical_question=scenario.question,
            clarification=None,
            suggestions=(),
        )
    if len(matches) > 1:
        return RoutingResult(
            disposition=RoutingDisposition.AMBIGUOUS,
            scenario_key=None,
            canonical_question=None,
            clarification=(
                "I can answer one governed question at a time. "
                "Please choose one supported question."
            ),
            suggestions=suggestions,
        )
    return RoutingResult(
        disposition=RoutingDisposition.UNSUPPORTED,
        scenario_key=None,
        canonical_question=None,
        clarification=(
            "I could not map that message to a governed question. "
            "Please choose or rephrase one supported question."
        ),
        suggestions=suggestions,
    )


def route_governed_question(value: str) -> RoutingResult:
    return _route_tokens(_routing_tokens(value))


def route_draft_messages(messages: tuple[ThreadMessage, ...]) -> RoutingResult:
    tokens: set[str] = set()
    for message in messages:
        if message.kind in {
            ThreadMessageKind.USER_QUESTION,
            ThreadMessageKind.USER_CLARIFICATION,
        }:
            tokens.update(_routing_tokens(message.content))
    return _route_tokens(tokens)


def deterministic_thread_title(value: str) -> str:
    title = " ".join(value.split())
    return title if len(title) <= 80 else f"{title[:79].rstrip()}…"
