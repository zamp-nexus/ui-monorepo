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
from .thread import (
    PostgresThreadRepository,
    PostgresThreadUnitOfWork,
    PostgresThreadUnitOfWorkFactory,
)
from .workspace import (
    PostgresOrganizationRepository,
    PostgresOrganizationUnitOfWork,
    PostgresOrganizationUnitOfWorkFactory,
)

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
    "PostgresOrganizationRepository",
    "PostgresOrganizationUnitOfWork",
    "PostgresOrganizationUnitOfWorkFactory",
    "PostgresRelationRepository",
    "PostgresThreadRepository",
    "PostgresThreadUnitOfWork",
    "PostgresThreadUnitOfWorkFactory",
    "metadata",
    "resolve_identity_context",
]
