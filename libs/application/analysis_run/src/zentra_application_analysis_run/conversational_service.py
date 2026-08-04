"""Replies to a message Intake routed as not analytical (ADR-0033).

Mirrors `IntakeService`'s shape: a fresh Conversational Agent per call rather
than one built once and shared, so a future per-tenant model-tier choice
never requires a second refactor of the wiring, even though nothing here is
per-request state today.
"""

from __future__ import annotations

from collections.abc import AsyncIterator, Callable
from typing import Protocol
from uuid import UUID

from zentra_domain_agent_execution import AgentInput, AgentOutput


class _ConversationalAgent(Protocol):
    """What this Service needs beyond the plain `AgentPort` shape.

    `invoke_stream` is specific to the Conversational Agent, not a general
    `AgentPort` method — every structured, tool-calling role never streams,
    so generalizing it onto the shared port would be speculative for roles
    that will never use it.
    """

    async def invoke(self, agent_input: AgentInput) -> AgentOutput: ...

    def invoke_stream(self, agent_input: AgentInput) -> AsyncIterator[str]: ...


class ConversationalService:
    def __init__(
        self,
        *,
        agent_factory: Callable[[], _ConversationalAgent],
        new_id: Callable[[], UUID],
    ) -> None:
        self._agent_factory = agent_factory
        self._new_id = new_id

    async def reply(self, message: str, *, organization_id: UUID) -> str:
        agent = self._agent_factory()
        output = await agent.invoke(
            AgentInput(
                # Discarded: a conversational reply never becomes an
                # AnalysisRun, so there is nothing for this id to name.
                analysis_run_id=self._new_id(),
                organization_id=organization_id,
                state={"message": message},
            )
        )
        return str(output.fields["reply"])

    async def reply_stream(
        self, message: str, *, organization_id: UUID
    ) -> AsyncIterator[str]:
        agent = self._agent_factory()
        async for chunk in agent.invoke_stream(
            AgentInput(
                analysis_run_id=self._new_id(),
                organization_id=organization_id,
                state={"message": message},
            )
        ):
            yield chunk
