"""Nexus Postgres control-plane adapter"""

from .agent_access import PostgresAgentAccessRepository
from .connector import PostgresDataSourceRepository
from .connector_catalog import (
    PostgresCatalogRepository,
    PostgresHarvestRunRepository,
    PostgresRelationRepository,
)
from .database import Database
from .execution_job import PostgresExecutionJobRepository
from .notify import listen as listen_for_notify
from .identity import (
    IdentityContext,
    IdentityNotBoundError,
    resolve_identity_context,
)
from .analysis_run import (
    ConcurrentAnalysisRunUpdateError,
    OutboxRecord,
    PostgresAnalysisRunUnitOfWork,
    PostgresAnalysisRunUnitOfWorkFactory,
)
from .organization_provisioning import (
    PostgresOrganizationProvisioningRepository,
    PostgresOrganizationProvisioningUnitOfWork,
    PostgresOrganizationProvisioningUnitOfWorkFactory,
)
from .schema import metadata
from .sequence import (
    PostgresSequenceRepository,
    PostgresSequenceUnitOfWork,
    PostgresSequenceUnitOfWorkFactory,
)
from .thread import (
    PostgresThreadRepository,
    PostgresThreadUnitOfWork,
    PostgresThreadUnitOfWorkFactory,
)
from .visualization import PostgresVisualizationRepository
from .work_feed import PostgresWorkFeedRepository
from .workspace import (
    PostgresGroupRepository,
    PostgresGroupUnitOfWork,
    PostgresGroupUnitOfWorkFactory,
)

__all__ = [
    "Database",
    "listen_for_notify",
    "IdentityContext",
    "IdentityNotBoundError",
    "ConcurrentAnalysisRunUpdateError",
    "OutboxRecord",
    "PostgresAgentAccessRepository",
    "PostgresCatalogRepository",
    "PostgresDataSourceRepository",
    "PostgresHarvestRunRepository",
    "PostgresExecutionJobRepository",
    "PostgresAnalysisRunUnitOfWork",
    "PostgresAnalysisRunUnitOfWorkFactory",
    "PostgresGroupRepository",
    "PostgresGroupUnitOfWork",
    "PostgresGroupUnitOfWorkFactory",
    "PostgresOrganizationProvisioningRepository",
    "PostgresOrganizationProvisioningUnitOfWork",
    "PostgresOrganizationProvisioningUnitOfWorkFactory",
    "PostgresRelationRepository",
    "PostgresSequenceRepository",
    "PostgresSequenceUnitOfWork",
    "PostgresSequenceUnitOfWorkFactory",
    "PostgresThreadRepository",
    "PostgresThreadUnitOfWork",
    "PostgresThreadUnitOfWorkFactory",
    "PostgresWorkFeedRepository",
    "PostgresVisualizationRepository",
    "metadata",
    "resolve_identity_context",
]
