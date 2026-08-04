"""Persist Workflow Studio drafts and immutable published versions."""

from alembic import op

revision = "0002_workflow_studio"
down_revision = "0001_initial_schema"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        CREATE TABLE workflow_definitions (
          workflow_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          organization_id UUID NOT NULL REFERENCES organizations(organization_id)
            ON DELETE CASCADE,
          name TEXT NOT NULL,
          draft_definition JSONB NOT NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          UNIQUE (workflow_id, organization_id)
        );
        CREATE TABLE workflow_versions (
          workflow_version_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          workflow_id UUID NOT NULL REFERENCES workflow_definitions(workflow_id)
            ON DELETE CASCADE,
          organization_id UUID NOT NULL REFERENCES organizations(organization_id)
            ON DELETE CASCADE,
          version INTEGER NOT NULL,
          definition JSONB NOT NULL,
          published_by_user_id UUID NOT NULL REFERENCES users(user_id),
          published_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          UNIQUE (workflow_id, version)
        );
        CREATE INDEX ix_workflows_organization_updated
          ON workflow_definitions(organization_id, updated_at);
        CREATE INDEX ix_workflow_versions_organization_published
          ON workflow_versions(organization_id, published_at);
        """
    )
    for table in ("workflow_definitions", "workflow_versions"):
        op.execute(f'ALTER TABLE "{table}" ENABLE ROW LEVEL SECURITY')
        op.execute(f'ALTER TABLE "{table}" FORCE ROW LEVEL SECURITY')
        op.execute(
            f"""
            CREATE POLICY {table}_organization_isolation ON "{table}"
            USING (
              organization_id = NULLIF(
                current_setting('app.organization_id', true), ''
              )::uuid
            )
            WITH CHECK (
              organization_id = NULLIF(
                current_setting('app.organization_id', true), ''
              )::uuid
            )
            """
        )
        op.execute(
            f'GRANT SELECT, INSERT, UPDATE, DELETE ON "{table}" TO zentra_runtime'
        )


def downgrade() -> None:
    op.execute("DROP TABLE workflow_versions")
    op.execute("DROP TABLE workflow_definitions")
