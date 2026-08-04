"""Replies to a message Intake routed as not analytical (ADR-0033).

Mirrors `IntakeService`'s shape: a fresh Conversational Agent per call rather
than one built once and shared, so a future per-tenant model-tier choice
never requires a second refactor of the wiring, even though nothing here is
per-request state today.
"""

from __future__ import annotations

from collections.abc import Callable
from uuid import UUID

from zentra_domain_agent_execution import AgentInput, AgentPort


class ConversationalService:
    def __init__(
        self,
        *,
        agent_factory: Callable[[], AgentPort],
        new_id: Callable[[], UUID],
    ) -> None:
        self._agent_factory = agent_factory
        self._new_id = new_id

    async def reply(self, message: str, *, organization_id: UUID) -> str:
        agent = self._agent_factory()
        output = await agent.invoke(
            AgentInput(
                # Discarded: a conversational reply never becomes an
                # Investigation, so there is nothing for this id to name.
                investigation_id=self._new_id(),
                organization_id=organization_id,
                state={"message": message},
            )
        )
        return str(output.fields["reply"])
