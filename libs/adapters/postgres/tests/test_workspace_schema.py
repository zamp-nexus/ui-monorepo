from sqlalchemy import UniqueConstraint

from zentra_adapter_postgres.schema import projects, workspace_groups


def test_workspace_tables_enforce_parent_scoped_name_uniqueness() -> None:
    group_uniques = {
        constraint.name
        for constraint in workspace_groups.constraints
        if isinstance(constraint, UniqueConstraint)
    }
    project_uniques = {
        constraint.name
        for constraint in projects.constraints
        if isinstance(constraint, UniqueConstraint)
    }

    assert "uq_workspace_groups_tenant_name" in group_uniques
    assert "uq_workspace_groups_tenant_identity" in group_uniques
    assert "uq_projects_group_name" in project_uniques
    assert "uq_projects_tenant_identity" in project_uniques


def test_projects_carry_the_tenant_in_the_group_foreign_key() -> None:
    parent_columns = {
        tuple(element.target_fullname for element in constraint.elements)
        for constraint in projects.foreign_key_constraints
    }

    assert ("workspace_groups.group_id", "workspace_groups.tenant_id") in parent_columns
