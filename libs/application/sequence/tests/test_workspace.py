from __future__ import annotations

from uuid import UUID, uuid4

from zentra_application_sequence import dataset_workspace_id_for


def test_the_same_tenant_always_derives_the_same_workspace_id() -> None:
    organization_id = uuid4()
    assert dataset_workspace_id_for(organization_id) == dataset_workspace_id_for(organization_id)


def test_different_tenants_derive_different_workspace_ids() -> None:
    assert dataset_workspace_id_for(uuid4()) != dataset_workspace_id_for(uuid4())


def test_the_derived_id_is_a_valid_uuid() -> None:
    workspace_id = dataset_workspace_id_for(uuid4())
    assert isinstance(workspace_id, UUID)
