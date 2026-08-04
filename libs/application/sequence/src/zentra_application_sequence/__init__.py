"""Nexus Sequence application: read models and manual creation over the
Sequence domain."""

from .dto import (
    AuthenticatedActor,
    FailedRunView,
    PermissionDeniedError,
    PreparedTableNotFoundError,
    PreparedTablePreview,
    PreparedTableView,
    RawTableNotFoundError,
    Role,
    SequenceGraphView,
    SequenceListItem,
    SequenceNotFoundError,
    SequenceOrigin,
    SequenceSlice,
    SequenceStepView,
)
from .lineage import (
    anchor_for_failed_run,
    build_graph_view,
    build_preview,
    raw_table_label,
)
from .ports import (
    RawTableResolver,
    SequenceRepository,
    SequenceUnitOfWork,
    SequenceUnitOfWorkFactory,
)
from .service import SequenceService
from .workspace import DATASET_WORKSPACE_NAMESPACE, dataset_workspace_id_for

__all__ = [
    "DATASET_WORKSPACE_NAMESPACE",
    "AuthenticatedActor",
    "FailedRunView",
    "PermissionDeniedError",
    "PreparedTableNotFoundError",
    "PreparedTablePreview",
    "PreparedTableView",
    "RawTableNotFoundError",
    "RawTableResolver",
    "Role",
    "SequenceGraphView",
    "SequenceListItem",
    "SequenceNotFoundError",
    "SequenceOrigin",
    "SequenceRepository",
    "SequenceService",
    "SequenceSlice",
    "SequenceStepView",
    "SequenceUnitOfWork",
    "SequenceUnitOfWorkFactory",
    "anchor_for_failed_run",
    "build_graph_view",
    "build_preview",
    "dataset_workspace_id_for",
    "raw_table_label",
]
