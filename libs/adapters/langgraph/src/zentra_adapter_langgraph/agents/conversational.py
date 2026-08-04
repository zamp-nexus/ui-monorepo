from __future__ import annotations

from collections.abc import AsyncIterator

from zentra_domain_agent_execution import (
    AgentDescriptor,
    AgentInput,
    AgentOutput,
    AgentRole,
    ModelMessage,
    ModelPort,
    ModelStreamDelta,
    ValidationOutcome,
    validate_agent_output,
)

from ..constants import CONVERSATIONAL_MODEL, MAX_TOKENS
from ..prompts import CONVERSATIONAL_REPLY
from ..schemas import CONVERSATIONAL_SCHEMA

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
        """One blocking call. Used where a caller wants the whole reply at
        once (evals) rather than the live-typing path `invoke_stream` serves.

        Asks for plain prose, not the `{"reply": ...}` wrapper the schema on
        `DESCRIPTOR` still describes: the only field this Agent ever produces
        is that one string, nothing downstream parses further structure out
        of it, and a JSON envelope only gets in the way of streaming it —
        see `invoke_stream`.
        """
        message = str(agent_input.state["message"])
        response = await self._model.complete(
            model=CONVERSATIONAL_MODEL,
            system=CONVERSATIONAL_REPLY,
            messages=[ModelMessage(role="user", content=message)],
            max_tokens=MAX_TOKENS,
            response_schema=None,
        )
        reply = response.text.strip()
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

    async def invoke_stream(self, agent_input: AgentInput) -> AsyncIterator[str]:
        """The live-typing path: raw prose chunks, safe to forward verbatim.

        No JSON envelope to partially reveal — see `invoke`'s docstring — so
        every chunk the model produces is already user-visible text.
        """
        message = str(agent_input.state["message"])
        async for event in self._model.stream(
            model=CONVERSATIONAL_MODEL,
            system=CONVERSATIONAL_REPLY,
            messages=[ModelMessage(role="user", content=message)],
            max_tokens=MAX_TOKENS,
        ):
            if isinstance(event, ModelStreamDelta) and event.text:
                yield event.text
