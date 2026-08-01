"""Confirming a Sequence's requested Raw Table actually exists.

`RawTableResolver` is `zentra_application_sequence`'s port for this; this
module is the one adapter for it, implemented over `ConnectorService` so the
sequence application package never imports the connector directly.
"""

from __future__ import annotations

from uuid import UUID, uuid4

from zentra_application_connector import AuthenticatedActor as ConnectorActor
from zentra_application_connector import CatalogVersionNotFoundError, ConnectorService
from zentra_application_connector import Role as ConnectorRole
from zentra_domain_sequence import (
    ConnectorSourceTableReference,
    DatasetTableVersionReference,
    RawTableReference,
)


class ConnectorRawTableResolver:
    """Adapts `ConnectorService` to satisfy `RawTableResolver` by shape."""

    def __init__(self, connector: ConnectorService) -> None:
        self._connector = connector

    async def label(
        self, tenant_id: UUID, reference: RawTableReference
    ) -> str | None:
        if isinstance(reference, DatasetTableVersionReference):
            # No Data Source upload path exists yet (Phase 3) — nothing can
            # confirm one of these actually exists, so it is trusted as given.
            return reference.storage_locator
        return await self._connector_source_table_label(tenant_id, reference)

    async def _connector_source_table_label(
        self, tenant_id: UUID, reference: ConnectorSourceTableReference
    ) -> str | None:
        try:
            catalog_version_id = UUID(reference.catalog_version_id)
        except ValueError:
            return None
        actor = ConnectorActor(
            user_id=uuid4(), tenant_id=tenant_id, role=ConnectorRole.VIEWER
        )
        try:
            catalog = await self._connector.get_catalog(actor, catalog_version_id)
        except CatalogVersionNotFoundError:
            return None
        for table in catalog.tables:
            if table.qualified_name == reference.source_table_name:
                return table.qualified_name
        return None
