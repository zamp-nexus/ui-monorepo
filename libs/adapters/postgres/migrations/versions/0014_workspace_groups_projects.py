"""Add tenant-scoped organizational Groups.

Originally added Projects alongside Groups too. Projects were removed from
the schema entirely by the Chat & Analysis Run cutover (0023,
chat_analysis_run_cutover) -- ADR-0028 makes Groups own Chat Sessions
directly, with no Project layer in between. There is no production
deployment with historical Project data to preserve (ADR-0030), so this
migration is edited in place rather than left creating a table an import
away from breaking every fresh `alembic upgrade head` from here forward.
"""

from alembic import op
from sqlalchemy import inspect

from zentra_adapter_postgres.schema import workspace_groups

revision = "0014_workspace_groups_projects"
down_revision = "0013_outbox_investigation_index"
branch_labels = None
depends_on = None


def _install_tenant_policy(table_name: str) -> None:
    op.execute(f"ALTER TABLE {table_name} ENABLE ROW LEVEL SECURITY")
    op.execute(f"ALTER TABLE {table_name} FORCE ROW LEVEL SECURITY")
    op.execute(f"DROP POLICY IF EXISTS {table_name}_tenant_isolation ON {table_name}")
    op.execute(
        f"""
        CREATE POLICY {table_name}_tenant_isolation ON {table_name}
        USING (
          tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
        )
        WITH CHECK (
          tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
        )
        """
    )
    op.execute(
        f"GRANT SELECT, INSERT, UPDATE, DELETE ON {table_name} TO zentra_runtime"
    )


def upgrade() -> None:
    bind = op.get_bind()
    existing = set(inspect(bind).get_table_names())
    if "workspace_groups" not in existing:
        workspace_groups.create(bind=bind)
    _install_tenant_policy("workspace_groups")


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS workspace_groups")
