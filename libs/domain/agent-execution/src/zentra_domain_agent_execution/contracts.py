from __future__ import annotations

from collections.abc import Awaitable
from decimal import Decimal
from enum import StrEnum
from typing import Annotated, Literal, Protocol
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, TypeAdapter, field_validator
from pydantic.types import JsonValue


class AgentRole(StrEnum):
    ORCHESTRATOR = "orchestrator"
    DATA_INTAKE = "data_intake"
    DATA_QUALITY = "data_quality"
    DATA_PREPARATION = "data_preparation"
    SEMANTIC_MODELING = "semantic_modeling"
    SQL_ANALYST = "sql_analyst"
    EVALUATOR = "evaluator"
    STATISTICIAN = "statistician"
    INSIGHT_ROOT_CAUSE = "insight_root_cause"
    DEMAND_PLANNER = "demand_planner"
    FORECASTER = "forecaster"
    VISUALIZATION = "visualization"
    EXECUTIVE_REPORT_WRITER = "executive_report_writer"
    KNOWLEDGE = "knowledge"


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
        return ExecutionUsage(
            input_tokens=self.input_tokens + other.input_tokens,
            output_tokens=self.output_tokens + other.output_tokens,
            cost_usd=self.cost_usd + other.cost_usd,
            model=self.model or other.model,
        )


class AgentOutput(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    fields: dict[str, JsonValue]
    evidence_refs: tuple[str, ...] = ()
    outcome: OutcomeSignal
    usage: ExecutionUsage = ExecutionUsage()

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


def validate_agent_output(port: AgentPort, output: AgentOutput) -> AgentOutput:
    undeclared = output.fields.keys() - port.descriptor.output_fields
    if undeclared:
        names = ", ".join(sorted(undeclared))
        raise ValueError(f"Agent output contains undeclared fields: {names}")
    return output
