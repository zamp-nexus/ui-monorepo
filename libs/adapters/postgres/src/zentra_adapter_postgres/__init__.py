"""ZentraOS Postgres control-plane adapter"""

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
    "PostgresInvestigationUnitOfWork",
    "PostgresInvestigationUnitOfWorkFactory",
    "PostgresOrganizationRepository",
    "PostgresOrganizationUnitOfWork",
    "PostgresOrganizationUnitOfWorkFactory",
    "metadata",
    "resolve_identity_context",
]
