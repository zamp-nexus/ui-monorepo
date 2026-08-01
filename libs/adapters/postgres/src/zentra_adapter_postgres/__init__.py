"""ZentraOS Postgres control-plane adapter"""

from .connector import PostgresDataSourceRepository
from .connector_catalog import (
    PostgresCatalogRepository,
    PostgresHarvestRunRepository,
    PostgresRelationRepository,
)
from .database import Database
from .identity import (
    IdentityContext,
    IdentityNotBoundError,
    resolve_identity_context,
)
from .investigation import (
    ConcurrentInvestigationUpdateError,
    OutboxRecord,
    PostgresInvestigationUnitOfWork,
    PostgresInvestigationUnitOfWorkFactory,
)
from .schema import metadata

__all__ = [
    "Database",
    "IdentityContext",
    "IdentityNotBoundError",
    "ConcurrentInvestigationUpdateError",
    "OutboxRecord",
    "PostgresCatalogRepository",
    "PostgresDataSourceRepository",
    "PostgresHarvestRunRepository",
    "PostgresInvestigationUnitOfWork",
    "PostgresInvestigationUnitOfWorkFactory",
    "PostgresRelationRepository",
    "metadata",
    "resolve_identity_context",
]
