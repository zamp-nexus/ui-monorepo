from __future__ import annotations

from sqlalchemy import select
from zentra_adapter_postgres import Database
from zentra_adapter_postgres.schema import agent_registry
from zentra_domain_agent_execution import AgentRole, RegisteredAgent


class PostgresAgentRegistry:
    """Which agents exist is a table, not a code list (ADR-002).

    The database constraint already forbids `enabled` without a passing eval,
    so disabling a misbehaving agent is a row update rather than a deploy.
    """

    def __init__(self, database: Database) -> None:
        self._database = database

    async def enabled_agents(self) -> tuple[RegisteredAgent, ...]:
        async with self._database.engine.connect() as connection:
            rows = (
                await connection.execute(
                    select(
                        agent_registry.c.agent_id,
                        agent_registry.c.role,
                        agent_registry.c.version,
                    ).where(agent_registry.c.enabled.is_(True))
                )
            ).all()
        return tuple(
            RegisteredAgent(
                agent_id=row.agent_id,
                role=AgentRole(row.role),
                version=row.version,
            )
            for row in rows
        )
