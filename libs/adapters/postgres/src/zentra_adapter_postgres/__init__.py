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
    "PostgresInvestigationUnitOfWork",
    "PostgresInvestigationUnitOfWorkFactory",
    "PostgresOrganizationRepository",
    "PostgresOrganizationUnitOfWork",
    "PostgresOrganizationUnitOfWorkFactory",
    "PostgresThreadRepository",
    "PostgresThreadUnitOfWork",
    "PostgresThreadUnitOfWorkFactory",
    "metadata",
    "resolve_identity_context",
]
