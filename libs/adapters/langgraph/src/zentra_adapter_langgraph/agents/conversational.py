from __future__ import annotations

from zentra_domain_agent_execution import (
    AgentDescriptor,
    AgentInput,
    AgentOutput,
    AgentRole,
    ModelMessage,
    ModelPort,
    ValidationOutcome,
    validate_agent_output,
)

from ..constants import CONVERSATIONAL_MODEL, MAX_TOKENS
from ..prompts import CONVERSATIONAL_REPLY
from ..schemas import CONVERSATIONAL_SCHEMA, parse_json_object

AGENT_ID = "conversational_v1"

DESCRIPTOR = AgentDescriptor(
    agent_id=AGENT_ID,
    role=AgentRole.CONVERSATIONAL,
    tool_permissions=(),
    context_budget_tokens=MAX_TOKENS,
    input_schema={"type": "object", "properties": {"message": {"type": "string"}}},
    output_schema=CONVERSATIONAL_SCHEMA,
    output_fields=frozenset({"reply"}),
    eval_suite_ref="evals/conversational",
)


class ConversationalAgent:
    """Replies to a message Intake routed as not analytical (ADR-0033).

    No tool access, no semantic layer: this Agent never queries data and
    never produces an Analysis Run. If a reply looks like it should have
    been analytical, that is Intake's routing to fix, not this Agent's job.
    """

    def __init__(self, *, model: ModelPort) -> None:
        self._model = model

    @property
    def descriptor(self) -> AgentDescriptor:
        return DESCRIPTOR

    async def invoke(self, agent_input: AgentInput) -> AgentOutput:
        message = str(agent_input.state["message"])
        response = await self._model.complete(
            model=CONVERSATIONAL_MODEL,
            system=CONVERSATIONAL_REPLY,
            messages=[ModelMessage(role="user", content=message)],
            max_tokens=MAX_TOKENS,
            response_schema=CONVERSATIONAL_SCHEMA,
        )
        decision = parse_json_object(response.text)
        reply = str(decision.get("reply", "")).strip()
        return validate_agent_output(
            self,
            AgentOutput(
                fields={"reply": reply},
                outcome=ValidationOutcome(
                    passed=bool(reply),
                    checks=("A reply was produced.",),
                    issues=() if reply else ("The reply was empty.",),
                ),
                usage=response.usage,
                fallbacks=response.fallbacks,
            ),
        )
