from __future__ import annotations

from collections.abc import Awaitable
from decimal import Decimal
from enum import StrEnum
from typing import Annotated, Literal, Protocol
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, TypeAdapter, field_validator
from pydantic.types import JsonValue


class AgentRole(StrEnum):
    INTAKE = "intake"
    ORCHESTRATOR = "orchestrator"
    DATA_INTAKE = "data_intake"
    DATA_QUALITY = "data_quality"
    DATA_PREPARATION = "data_preparation"
    SEMANTIC_MODELING = "semantic_modeling"
    SQL_ANALYST = "sql_analyst"
    EVALUATOR = "evaluator"
    STATISTICIAN = "statistician"
    INSIGHT = "insight"
    INSIGHT_ROOT_CAUSE = "insight_root_cause"
    DEMAND_PLANNER = "demand_planner"
    FORECASTER = "forecaster"
    VISUALIZATION = "visualization"
    EXECUTIVE_REPORT_WRITER = "executive_report_writer"
    KNOWLEDGE = "knowledge"


# Read-compatibility only. Phase 1 wrote `insight_root_cause` before any Insight
# implementation existed, and ADR 0011 forbids naming the Agent for a causal
# promise its evidence cannot keep. Dropping the value would make those
# investigations unreadable rather than merely mislabelled, so it stays
# deserialisable and is refused at the write seams instead.
LEGACY_ROLES: frozenset[AgentRole] = frozenset({AgentRole.INSIGHT_ROOT_CAUSE})


CANONICAL_ROLES: frozenset[AgentRole] = frozenset(AgentRole) - LEGACY_ROLES


class LegacyRoleWriteError(ValueError):
    """A legacy compatibility role reached a write path."""


def reject_legacy_role(role: AgentRole) -> None:
    """Refuses a role that may only ever be read.

    This is the expand step of an expand-contract migration: the accepted write
    vocabulary narrows now, the legacy read path is removed separately.
    """
    if role in LEGACY_ROLES:
        raise LegacyRoleWriteError(
            f"{role.value!r} is a read-compatibility role and cannot be "
            f"written. Use {AgentRole.INSIGHT.value!r}."
        )


class ToolAccess(StrEnum):
    READ = "read"
    WRITE = "write"
    EXECUTE = "execute"


class ToolScope(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    tool_name: str = Field(min_length=1)
    access: ToolAccess


class ConfidenceOutcome(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    kind: Literal["confidence"] = "confidence"
    score: float = Field(ge=0, le=1)
    calibration_method: str = Field(min_length=1)


class ValidationOutcome(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    kind: Literal["validation"] = "validation"
    passed: bool
    checks: tuple[str, ...] = ()
    issues: tuple[str, ...] = ()


OutcomeSignal = Annotated[
    ConfidenceOutcome | ValidationOutcome,
    Field(discriminator="kind"),
]
OUTCOME_ADAPTER = TypeAdapter(OutcomeSignal)


class AgentInput(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    investigation_id: UUID
    tenant_id: UUID
    state: dict[str, JsonValue]


class ExecutionUsage(BaseModel):
    """What one unit of agent work consumed. Feeds tracing, the audit ledger,
    and cost governance from a single measurement (§3.10)."""

    model_config = ConfigDict(extra="forbid", frozen=True)

    input_tokens: int = Field(default=0, ge=0)
    output_tokens: int = Field(default=0, ge=0)
    cost_usd: Decimal = Field(default=Decimal("0"), ge=0)
    model: str | None = None

    def __add__(self, other: ExecutionUsage) -> ExecutionUsage:
        """Tokens and cost add up. The model does not.

        Deliberately drops it rather than picking one. An agent makes several
        calls and the chain can serve them from different providers — a live
        free-tier run had the Evaluator plan on Nemotron and recheck on Opus.
        Keeping the first silently recorded Nemotron as the checker, which
        under-graded the independence and hid $0.08 of Anthropic spend behind a
        free model's name. Which call decided is the agent's to say.
        """
        return ExecutionUsage(
            input_tokens=self.input_tokens + other.input_tokens,
            output_tokens=self.output_tokens + other.output_tokens,
            cost_usd=self.cost_usd + other.cost_usd,
        )


class AgentOutput(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    fields: dict[str, JsonValue]
    evidence_refs: tuple[str, ...] = ()
    outcome: OutcomeSignal
    usage: ExecutionUsage = ExecutionUsage()
    fallbacks: tuple[str, ...] = ()

    @field_validator("evidence_refs")
    @classmethod
    def validate_evidence_refs(cls, refs: tuple[str, ...]) -> tuple[str, ...]:
        if any(not ref.startswith("artifact://") for ref in refs):
            raise ValueError("Evidence references must use the artifact:// scheme")
        return refs


class AgentDescriptor(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    agent_id: str = Field(min_length=1)
    role: AgentRole
    tool_permissions: tuple[ToolScope, ...]
    context_budget_tokens: int = Field(gt=0)
    input_schema: dict[str, JsonValue]
    output_schema: dict[str, JsonValue]
    output_fields: frozenset[str]
    eval_suite_ref: str = Field(min_length=1)
    fallback_ref: str | None = None


class AgentPort(Protocol):
    @property
    def descriptor(self) -> AgentDescriptor: ...

    def invoke(self, agent_input: AgentInput) -> Awaitable[AgentOutput]: ...


# Matched as substrings, not prefixes: vendors bury the family mid-identifier
# (`zai-glm-4.7`, `openai/gpt-oss-120b`).
_FAMILY_MARKERS: tuple[tuple[str, str], ...] = (
    ("gpt-oss", "gpt-oss"),
    ("claude", "claude"),
    ("gemini", "gemini"),
    ("nemotron", "nemotron"),
    ("glm", "glm"),
    ("gpt-5", "gpt-5"),
    ("kimi", "kimi"),
    ("qwen", "qwen"),
    ("llama", "llama"),
)


def model_family(model: str | None) -> str | None:
    """Reduce a model id to the family whose blind spots it shares.

    Two agents on the same family do not give independent answers, however
    different their prompts. Used to detect when fallback has collapsed the
    Evaluator onto the Analyst's model.
    """
    if not model:
        return None
    name = model.rsplit("/", maxsplit=1)[-1].lower()
    for marker, family in _FAMILY_MARKERS:
        if marker in name:
            return family
    return name


class IndependenceLevel(StrEnum):
    """How much a recheck is actually worth.

    A second call to the same model varies by sampling — different wording, a
    different path, sometimes a different answer — but shares the weights, the
    training and the alignment, so it shares the systematic blind spots. It is a
    second pass by one expert, not a second expert.

    Two models from one lab are genuinely different reasoners that still share a
    training philosophy. Two labs are the real thing.
    """

    NONE = "none"
    PARTIAL = "partial"
    FULL = "full"

    @property
    def confidence_ceiling(self) -> float:
        return _INDEPENDENCE_CEILINGS[self]


# A recheck is worth what its independence is worth, and the confidence should
# say so rather than a footnote saying so. Against the default 0.7 threshold:
# NONE gates, PARTIAL may publish but never at near-certainty, FULL stands.
_INDEPENDENCE_CEILINGS: dict[IndependenceLevel, float] = {
    IndependenceLevel.NONE: 0.50,
    IndependenceLevel.PARTIAL: 0.85,
    IndependenceLevel.FULL: 1.00,
}


def independence_of(
    analyst_model: str | None,
    evaluator_model: str | None,
) -> IndependenceLevel:
    """Grade the recheck by what actually served each agent.

    Unknown on either side is treated as NONE: an unverifiable claim about
    independence is not a claim.
    """
    if not analyst_model or not evaluator_model:
        return IndependenceLevel.NONE
    if analyst_model == evaluator_model:
        return IndependenceLevel.NONE
    if model_family(analyst_model) == model_family(evaluator_model):
        return IndependenceLevel.PARTIAL
    return IndependenceLevel.FULL


def validate_agent_output(port: AgentPort, output: AgentOutput) -> AgentOutput:
    undeclared = output.fields.keys() - port.descriptor.output_fields
    if undeclared:
        names = ", ".join(sorted(undeclared))
        raise ValueError(f"Agent output contains undeclared fields: {names}")
    return output
