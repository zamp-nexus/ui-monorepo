"""Dataset Workspace identity.

Data Source, which will own Dataset Workspace, has no persisted schema yet —
its domain library is CONTEXT.md-only. Rather than add a table whose only
content would be a 1:1 mapping to Organization, a Dataset Workspace's id is
derived deterministically from the Organization's own id: one Dataset
Workspace per Organization, until Data Source's own phase gives it real,
independent identity.
"""

from __future__ import annotations

from uuid import UUID, uuid5

#: A fixed, committed namespace so `dataset_workspace_id_for` is stable across
#: processes and deployments, not just within one Python runtime.
DATASET_WORKSPACE_NAMESPACE = UUID("3f8f7f9a-3b7a-4a3a-9b0e-6a1a2c9d4f10")


def dataset_workspace_id_for(organization_id: UUID) -> UUID:
    return uuid5(DATASET_WORKSPACE_NAMESPACE, str(organization_id))
