"""Which Data Connections an Analysis Run may query.

`AnalysisRun.data_connection_id` has existed since ADR-0012, and nothing ever
set it: every caller passed `None`, which means the demo warehouse. That was
invisible while the only questions were the two demo scenarios, because those
questions were *about* the demo warehouse. Free-text questions (ADR-0023) made
it a bug with a clear symptom — a tenant with a connected ClickHouse holding
`application_started` asked for an application count and was answered from
`Commerce.orderCount`, because the connected tables were never compiled into the
schema the Agent could see.

Resolved here, once, so the chat surface, the launcher and the catalog endpoint
cannot disagree about which data a tenant's question is asked against.
"""

from __future__ import annotations

from uuid import UUID

from zentra_application_analysis_run import AuthenticatedActor
from zentra_application_connector import (
    AuthenticatedActor as ConnectorActor,
)
from zentra_application_connector import ConnectorService
from zentra_application_connector import Role as ConnectorRole


async def active_data_connection_id(
    connector: ConnectorService | None,
    actor: AuthenticatedActor,
    *,
    requested: UUID | None = None,
) -> UUID | tuple[UUID, ...] | None:
    """The immutable source set for a new Analysis Run.

    A tuple is a source scope, not an instruction to join the sources.  The
    semantic layer routes every query to one tuple member and refuses a query
    that tries to mix member vocabularies.
    """
    if requested is not None:
        return (requested,)
    if connector is None:
        return None

    sources = await connector.list_sources(
        ConnectorActor(
            user_id=actor.user_id,
            organization_id=actor.organization_id,
            role=ConnectorRole(actor.role.value),
        )
    )
    if not sources:
        return None
    # Always retain the source-set wrapper, even for one connection. That gives
    # agent tools one stable, explicitly-qualified member format and prevents a
    # newly added second source from changing query semantics mid-conversation.
    return tuple(source.data_source_id for source in sources)
