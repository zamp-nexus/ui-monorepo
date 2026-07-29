from __future__ import annotations

import json

from zentra_domain_agent_execution import (
    AgentDescriptor,
    AgentInput,
    AgentOutput,
    AgentRegistryPort,
    AgentRole,
    ExecutionUsage,
    ModelMessage,
    ModelPort,
    ToolAccess,
    ToolScope,
    ValidationOutcome,
    validate_agent_output,
)

from ..constants import MAX_TOKENS, ORCHESTRATOR_MODEL
from ..prompts import ORCHESTRATOR_PLAN, ORCHESTRATOR_SYNTHESIZE
from ..schemas import SYNTHESIS_SCHEMA, TASK_LEDGER_SCHEMA, parse_json_object

AGENT_ID = "orchestrator_v1"

PLAN = "plan"
SYNTHESIZE = "synthesize"

# The roles this workflow cannot run without. Resolved against the registry at
# investigation start, never against a hardcoded list of implementations.
REQUIRED_ROLES = (AgentRole.SQL_ANALYST, AgentRole.EVALUATOR)

DESCRIPTOR = AgentDescriptor(
    agent_id=AGENT_ID,
    role=AgentRole.ORCHESTRATOR,
    # Task ledger only: the Orchestrator decomposes and synthesises, and can
    # reach neither the semantic layer nor a sandbox.
    tool_permissions=(ToolScope(tool_name="task_ledger", access=ToolAccess.WRITE),),
    context_budget_tokens=MAX_TOKENS,
    input_schema={"type": "object", "properties": {"phase": {"type": "string"}}},
    output_schema=SYNTHESIS_SCHEMA,
    output_fields=frozenset({"tasks", "headline", "summary", "contradictions"}),
    eval_suite_ref="evals/orchestrator",
)


class NoEnabledAgentError(RuntimeError):
    """A required role has no enabled, eval-passing agent registered."""


class OrchestratorAgent:
    """Decomposes the question, delegates, and synthesises. Executes nothing."""

    def __init__(
        self,
        *,
        model: ModelPort,
        registry: AgentRegistryPort,
    ) -> None:
        self._model = model
        self._registry = registry

    @property
    def descriptor(self) -> AgentDescriptor:
        return DESCRIPTOR

    async def invoke(self, agent_input: AgentInput) -> AgentOutput:
        phase = str(agent_input.state.get("phase", PLAN))
        if phase == PLAN:
            return await self._plan(agent_input)
        return await self._synthesize(agent_input)

    async def _plan(self, agent_input: AgentInput) -> AgentOutput:
        question = str(agent_input.state["question"])
        available = await self._available_roles()

        response = await self._model.complete(
            model=ORCHESTRATOR_MODEL,
            system=ORCHESTRATOR_PLAN,
            messages=[
                ModelMessage(
                    role="user",
                    content=(
                        f"Question: {question}\n\n"
                        f"Available roles: {', '.join(sorted(available))}"
                    ),
                )
            ],
            max_tokens=MAX_TOKENS,
            response_schema=TASK_LEDGER_SCHEMA,
        )
        ledger = parse_json_object(response.text)
        tasks = [
            task for task in ledger.get("tasks", []) if task.get("role") in available
        ]

        return validate_agent_output(
            self,
            AgentOutput(
                fields={"tasks": tasks},
                outcome=ValidationOutcome(
                    passed=bool(tasks),
                    checks=("Every delegated role is enabled in the registry.",),
                    issues=()
                    if tasks
                    else ("The plan delegated to no registered role.",),
                ),
                usage=_usage(response.usage),
            ),
        )

    async def _synthesize(self, agent_input: AgentInput) -> AgentOutput:
        question = str(agent_input.state["question"])
        analyst = agent_input.state["analyst"]
        evaluator = agent_input.state["evaluator"]
        assert isinstance(analyst, dict)
        assert isinstance(evaluator, dict)

        response = await self._model.complete(
            model=ORCHESTRATOR_MODEL,
            system=ORCHESTRATOR_SYNTHESIZE,
            messages=[
                ModelMessage(
                    role="user",
                    content=(
                        f"Question: {question}\n\n"
                        f"SQL Analyst metrics: "
                        f"{json.dumps(analyst.get('metrics', []))}\n"
                        f"SQL Analyst summary: {analyst.get('result_summary', '')}\n\n"
                        f"Evaluator recheck passed: {evaluator.get('recheck_passed')}\n"
                        f"Evaluator discrepancy: {evaluator.get('discrepancy_pct')}\n"
                        f"Evaluator issues: {json.dumps(evaluator.get('issues', []))}"
                    ),
                )
            ],
            max_tokens=MAX_TOKENS,
            response_schema=SYNTHESIS_SCHEMA,
        )
        synthesis = parse_json_object(response.text)
        contradictions = list(synthesis.get("contradictions", []))

        return validate_agent_output(
            self,
            AgentOutput(
                fields={
                    "headline": synthesis["headline"],
                    "summary": synthesis["summary"],
                    "contradictions": contradictions,
                },
                outcome=ValidationOutcome(
                    passed=not contradictions,
                    checks=(
                        "Every claim cites a metric the SQL Analyst returned.",
                        "The Evaluator's recheck was reconciled with the claim.",
                    ),
                    issues=tuple(contradictions),
                ),
                usage=_usage(response.usage),
            ),
        )

    async def _available_roles(self) -> set[str]:
        enabled = await self._registry.enabled_agents()
        available = {agent.role.value for agent in enabled}
        missing = [role.value for role in REQUIRED_ROLES if role.value not in available]
        if missing:
            raise NoEnabledAgentError(
                "No enabled agent is registered for required roles: "
                + ", ".join(missing)
            )
        return available


def _usage(usage: ExecutionUsage) -> ExecutionUsage:
    """Pass through untouched: the provider reported which model served this."""
    return usage
