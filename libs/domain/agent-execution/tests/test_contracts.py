from decimal import Decimal
from uuid import uuid4

import pytest
from pydantic import ValidationError

from zentra_domain_agent_execution import (
    AgentDescriptor,
    AgentInput,
    AgentOutput,
    AgentRole,
    ConfidenceOutcome,
    ExecutionUsage,
    ToolAccess,
    ToolScope,
    ValidationOutcome,
    validate_agent_output,
)


class StubAgent:
    descriptor = AgentDescriptor(
        agent_id="sql_analyst_v1",
        role=AgentRole.SQL_ANALYST,
        tool_permissions=(
            ToolScope(tool_name="semantic_layer_query", access=ToolAccess.READ),
        ),
        context_budget_tokens=4_000,
        input_schema=AgentInput.model_json_schema(),
        output_schema=AgentOutput.model_json_schema(),
        output_fields=frozenset({"sql", "result_summary"}),
        eval_suite_ref="evals/sql_analyst_v1.yaml",
    )

    async def invoke(self, agent_input: AgentInput) -> AgentOutput:
        return AgentOutput(
            fields={"sql": "SELECT 1", "result_summary": "one"},
            outcome=ConfidenceOutcome(
                score=0.9,
                calibration_method="schema_and_execution_agreement",
            ),
        )


def test_contract_generates_discriminated_json_schema() -> None:
    schema = AgentOutput.model_json_schema()

    assert "discriminator" in str(schema)
    assert "confidence" in str(schema)
    assert "validation" in str(schema)


def test_confidence_is_bounded() -> None:
    with pytest.raises(ValidationError):
        ConfidenceOutcome(score=1.01, calibration_method="test")


def test_validation_outcome_does_not_fabricate_confidence() -> None:
    output = AgentOutput(
        fields={"task_ledger_valid": True},
        outcome=ValidationOutcome(passed=True, checks=("task_schema",)),
    )

    assert output.outcome.kind == "validation"
    assert not hasattr(output.outcome, "score")


def test_evidence_references_are_metadata_only_artifact_pointers() -> None:
    output = AgentOutput(
        fields={"claim": "Refunds increased"},
        evidence_refs=("artifact://query/q_123",),
        outcome=ConfidenceOutcome(score=0.8, calibration_method="test"),
    )
    assert output.evidence_refs == ("artifact://query/q_123",)

    with pytest.raises(ValidationError, match="artifact://"):
        AgentOutput(
            fields={"claim": "Refunds increased"},
            evidence_refs=("raw customer row",),
            outcome=ConfidenceOutcome(score=0.8, calibration_method="test"),
        )


def test_input_rejects_unknown_fields() -> None:
    with pytest.raises(ValidationError):
        AgentInput(
            investigation_id=uuid4(),
            tenant_id=uuid4(),
            state={},
            caller_tenant_id=uuid4(),
        )


def test_output_rejects_undeclared_fields() -> None:
    output = AgentOutput(
        fields={"sql": "SELECT 1", "raw_credentials": "not allowed"},
        outcome=ConfidenceOutcome(score=0.8, calibration_method="test"),
    )

    with pytest.raises(ValueError, match="raw_credentials"):
        validate_agent_output(StubAgent(), output)


@pytest.mark.asyncio
async def test_agent_port_shape_is_usable() -> None:
    agent = StubAgent()
    output = await agent.invoke(
        AgentInput(
            investigation_id=uuid4(),
            tenant_id=uuid4(),
            state={"question": "Why did refunds increase?"},
        )
    )

    assert validate_agent_output(agent, output) == output


def test_adding_usage_drops_the_model_rather_than_guessing() -> None:
    """A live free-tier run planned on Nemotron and rechecked on Opus. Keeping
    the first call's model recorded a free provider as the checker, under-graded
    the independence, and hid the Anthropic spend."""
    plan = ExecutionUsage(input_tokens=10, cost_usd=Decimal("0"), model="nemotron")
    recheck = ExecutionUsage(
        input_tokens=5, cost_usd=Decimal("0.08"), model="claude-opus-5"
    )

    total = plan + recheck

    assert total.input_tokens == 15
    assert total.cost_usd == Decimal("0.08")
    assert total.model is None
