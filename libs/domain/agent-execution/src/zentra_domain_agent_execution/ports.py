from __future__ import annotations

from collections.abc import Awaitable, Sequence
from datetime import datetime
from enum import StrEnum
from typing import Literal, Protocol
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field
from pydantic.types import JsonValue

from .contracts import AgentRole, ConfidenceOutcome, ExecutionUsage, OutcomeSignal

# ---------------------------------------------------------------------------
# Semantic layer
#
# This is the only port in the system that reaches data. There is deliberately
# no raw-SQL port anywhere in the tree: ADR-003's "the SQL Analyst structurally
# cannot see raw tables" holds because no such capability exists to hand it.
# ---------------------------------------------------------------------------


class SemanticMeasure(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    name: str = Field(min_length=1)
    type: str = Field(min_length=1)
    format: str | None = None


class SemanticDimension(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    name: str = Field(min_length=1)
    type: str = Field(min_length=1)


class SemanticCatalog(BaseModel):
    """The governed vocabulary an agent may reference. No physical schema."""

    model_config = ConfigDict(extra="forbid", frozen=True)

    measures: tuple[SemanticMeasure, ...]
    dimensions: tuple[SemanticDimension, ...]

    def member_names(self) -> frozenset[str]:
        return frozenset(
            [measure.name for measure in self.measures]
            + [dimension.name for dimension in self.dimensions]
        )

    def reject_ungoverned(self, request: SemanticQuery) -> None:
        """Refuse a query that reaches past the governed vocabulary.

        Every SemanticLayerPort implementation must call this before executing.
        A semantic-layer failure is a refusal; a raw-SQL failure is a
        confidently wrong number (ADR-003), and this is what keeps it the
        former.
        """
        referenced = set(request.measures) | set(request.dimensions)
        referenced.update(
            time_dimension.dimension for time_dimension in request.time_dimensions
        )
        referenced.update(semantic_filter.member for semantic_filter in request.filters)
        unknown = referenced - self.member_names()
        if unknown:
            raise UnknownSemanticMemberError(
                "Query references members outside the governed catalog: "
                + ", ".join(sorted(unknown))
            )


class SemanticTimeDimension(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    dimension: str = Field(min_length=1)
    granularity: str | None = None
    date_range: tuple[str, str] | None = None


class SemanticFilter(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    member: str = Field(min_length=1)
    operator: str = Field(min_length=1)
    values: tuple[str, ...] = ()


class SemanticQuery(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    measures: tuple[str, ...] = ()
    dimensions: tuple[str, ...] = ()
    time_dimensions: tuple[SemanticTimeDimension, ...] = ()
    filters: tuple[SemanticFilter, ...] = ()
    limit: int | None = Field(default=None, gt=0)


class SemanticResult(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    query: SemanticQuery
    rows: tuple[dict[str, JsonValue], ...] = ()


class UnknownSemanticMemberError(ValueError):
    """A query referenced a member the governed catalog does not define."""


class SemanticLayerPort(Protocol):
    def catalog(self) -> Awaitable[SemanticCatalog]: ...

    def query(self, request: SemanticQuery) -> Awaitable[SemanticResult]: ...


# ---------------------------------------------------------------------------
# Model provider
# ---------------------------------------------------------------------------


class ModelMessage(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    role: Literal["user", "assistant"]
    content: str


class ModelResponse(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    text: str
    usage: ExecutionUsage
    # Rungs that failed before this one answered. Recorded even on success, so
    # Replay shows "Cerebras 402 -> NVIDIA 404 -> served by Gemini" rather than
    # silently showing Gemini.
    fallbacks: tuple[str, ...] = ()


def merged_fallbacks(*responses: ModelResponse) -> tuple[str, ...]:
    """Every rung that failed across the calls one agent made, in order.

    An agent makes several model calls, and each carries its own trail. Dropping
    all but the last would hide exactly the outage worth seeing.
    """
    seen: dict[str, None] = {}
    for response in responses:
        seen.update(dict.fromkeys(response.fallbacks))
    return tuple(seen)


class ModelPort(Protocol):
    def complete(
        self,
        *,
        model: str,
        system: str,
        messages: Sequence[ModelMessage],
        max_tokens: int,
        response_schema: dict[str, JsonValue] | None = None,
    ) -> Awaitable[ModelResponse]: ...


# ---------------------------------------------------------------------------
# Agent executions
# ---------------------------------------------------------------------------


class ExecutionStatus(StrEnum):
    SUCCESS = "success"
    FAILURE = "failure"
    PARTIAL = "partial"
    ESCALATED = "escalated"


class AgentExecutionRecord(BaseModel):
    """One bounded unit of agent work, scoped to a Tenant and Investigation."""

    model_config = ConfigDict(extra="forbid", frozen=True)

    execution_id: UUID
    investigation_id: UUID
    tenant_id: UUID
    agent_id: str = Field(min_length=1)
    role: AgentRole
    step: int = Field(ge=0)
    input: dict[str, JsonValue]
    output: dict[str, JsonValue] | None = None
    outcome: OutcomeSignal | None = None
    status: ExecutionStatus
    latency_ms: int = Field(ge=0)
    usage: ExecutionUsage = ExecutionUsage()
    evidence_refs: tuple[str, ...] = ()
    errors: tuple[str, ...] = ()
    fallbacks: tuple[str, ...] = ()
    started_at: datetime
    completed_at: datetime

    @property
    def confidence(self) -> float | None:
        if isinstance(self.outcome, ConfidenceOutcome):
            return self.outcome.score
        return None


class AgentExecutionRecorder(Protocol):
    """Persists a completed step before the next one starts, so an interrupted
    investigation still has a replayable trail of what already ran."""

    def record(self, execution: AgentExecutionRecord) -> Awaitable[None]: ...


# ---------------------------------------------------------------------------
# Agent registry (ADR-002: which agents exist is a table, never a code list)
# ---------------------------------------------------------------------------


class RegisteredAgent(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    agent_id: str = Field(min_length=1)
    role: AgentRole
    version: str = Field(min_length=1)


class AgentRegistryPort(Protocol):
    def enabled_agents(self) -> Awaitable[tuple[RegisteredAgent, ...]]: ...
