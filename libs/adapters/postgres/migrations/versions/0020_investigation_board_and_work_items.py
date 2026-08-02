"""Add the Investigation Board, Work Item queue, and Analytical Scope
(ADR-0026, ADR-0027): the durable working memory an Orchestrator Loop reads
and writes in place of a fixed LangGraph pipeline.

Investigation Board, its child tables, and Work Items are neutralized here:
the Chat & Analysis Run cutover (0023, chat_analysis_run_cutover) drops and
recreates all of them under their final shape (Investigation Board renamed
to Analysis Workspace, per ADR-0028) as part of its `metadata.create_all()`
pass. `analytical_scopes` is untouched by that rename, so it is still
created and RLS-installed here, exactly as before.
"""

from alembic import op

from zentra_adapter_postgres.schema import (
    analytical_scopes,
    metadata,
)

revision = "0020_investigation_board_and_work_items"
down_revision = "0019_sequence_domain"
branch_labels = None
depends_on = None

_TABLES_IN_DEPENDENCY_ORDER = (analytical_scopes,)


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
    metadata.create_all(bind=bind, tables=_TABLES_IN_DEPENDENCY_ORDER, checkfirst=True)
    for table in _TABLES_IN_DEPENDENCY_ORDER:
        _install_tenant_policy(table.name)


def downgrade() -> None:
    for table in reversed(_TABLES_IN_DEPENDENCY_ORDER):
        op.execute(f"DROP TABLE IF EXISTS {table.name}")
