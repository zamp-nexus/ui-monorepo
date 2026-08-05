"""Repair Workflow Studio tables omitted from previously stamped local databases."""

from alembic import op

from zentra_adapter_postgres.schema import (
    workflow_definitions,
    workflow_executions,
    workflow_versions,
)

revision = "0004_workflow_schema_repair"
down_revision = "0003_workflow_executions"
branch_labels = None
depends_on = None

WORKFLOW_TABLES = (
    workflow_definitions,
    workflow_versions,
    workflow_executions,
)


def _install_organization_policy(table_name: str) -> None:
    op.execute(f'ALTER TABLE "{table_name}" ENABLE ROW LEVEL SECURITY')
    op.execute(f'ALTER TABLE "{table_name}" FORCE ROW LEVEL SECURITY')
    op.execute(
        f"""
        DO $$
        BEGIN
          IF NOT EXISTS (
            SELECT 1 FROM pg_policies
            WHERE schemaname = 'public'
              AND tablename = '{table_name}'
              AND policyname = '{table_name}_organization_isolation'
          ) THEN
            CREATE POLICY {table_name}_organization_isolation ON "{table_name}"
            USING (
              organization_id =
                NULLIF(current_setting('app.organization_id', true), '')::uuid
            )
            WITH CHECK (
              organization_id =
                NULLIF(current_setting('app.organization_id', true), '')::uuid
            );
          END IF;
        END
        $$;
        """
    )
    op.execute(
        f'GRANT SELECT, INSERT, UPDATE, DELETE ON "{table_name}" TO zentra_runtime'
    )


def upgrade() -> None:
    workflow_definitions.create(bind=op.get_bind(), checkfirst=True)
    workflow_versions.create(bind=op.get_bind(), checkfirst=True)
    workflow_executions.create(bind=op.get_bind(), checkfirst=True)
    for table in WORKFLOW_TABLES:
        _install_organization_policy(table.name)


def downgrade() -> None:
    # This revision may have repaired an existing Workflow Execution table, so
    # it intentionally leaves the schema in place on downgrade.
    pass
