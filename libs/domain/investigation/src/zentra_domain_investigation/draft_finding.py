"""The Draft Finding — what the Insight Agent proposes, before anything decides.

A Phase 1 `Finding` is narrative: a headline, a summary, and a bag of opaque
`artifact://` strings. Whether a sentence was measured or inferred, whether a
contradiction was still open, and whether causality was established at all were
all buried in prose that only a person could read.

Phase 2 needs those as data, because Replay has to *render* them and the
publication policy has to *decide* on them. Everything here exists to make one
of those two possible; nothing here decides whether a draft publishes. That is
the Investigation's deterministic policy, deliberately elsewhere.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from enum import StrEnum
from uuid import UUID

from zentra_domain_agent_execution import ConfidenceOutcome


class DraftFindingError(ValueError):
    """A Draft Finding was assembled in a shape a reviewer could not trust."""


class ClaimKind(StrEnum):
    """Whether a claim reports a measurement or an Agent's reading of one.

    The single most important distinction in the whole Draft Finding, and the
    one prose is least able to carry reliably.
    """

    OBSERVED = "observed"
    INTERPRETATION = "interpretation"


class RootCauseState(StrEnum):
    """Whether the evidence establishes why the observed change happened.

    One member, deliberately. ADR 0011 forbids a Root Cause Claim until a
    separate causal-evidence standard is accepted, so `unresolved` is the only
    honest answer Phase 2 can give. Modelling it as a state rather than as a
    missing field is what lets the product *say* "root cause unresolved"
    instead of quietly saying nothing.
    """

    UNRESOLVED = "unresolved"


@dataclass(frozen=True, slots=True)
class Claim:
    """One substantive statement, and the evidence that will back it.

    `citation_ids` is empty until Evidence Citations exist. The field is here
    now so that adding them is a write, not a schema migration.
    """

    claim_id: UUID
    kind: ClaimKind
    text: str
    position: int
    citation_ids: tuple[UUID, ...] = ()


@dataclass(frozen=True, slots=True)
class Contradiction:
    """An Evaluator disagreement that synthesis must not smooth away."""

    detail: str
    resolved: bool = False


@dataclass(frozen=True, slots=True)
class DraftFinding:
    """An unpublished conclusion, owned by one Tenant and one Investigation."""

    draft_finding_id: UUID
    tenant_id: UUID
    investigation_id: UUID
    version: int
    created_at: datetime
    # The Insight Agent Execution that produced it. Optional only during the
    # migration window: Insight does not run yet, and a draft that predates it
    # has no execution to point at.
    produced_by_execution_id: UUID | None
    headline: str
    summary: str
    claims: tuple[Claim, ...]
    contradictions: tuple[Contradiction, ...]
    root_cause: RootCauseState
    # Already bounded by the application's independence and sample-size
    # ceilings, and carrying the name of whichever bound won. Insight does not
    # get to score itself past what its evidence allows.
    confidence: ConfidenceOutcome | None

    def __post_init__(self) -> None:
        positions = sorted(claim.position for claim in self.claims)
        if positions != list(range(len(self.claims))):
            raise DraftFindingError(
                "Claim positions must be contiguous from zero; a gap or a "
                f"duplicate means a claim was lost. Got {positions}."
            )
