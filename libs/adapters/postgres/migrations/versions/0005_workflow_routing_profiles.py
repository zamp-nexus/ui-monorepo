"""Version Workflow routing profiles and selection provenance."""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "0005_workflow_routing_profiles"
down_revision = "0004_workflow_schema_repair"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    for table_name in ("workflow_definitions", "workflow_versions"):
        columns = {column["name"] for column in inspector.get_columns(table_name)}
        if "routing_profile" not in columns:
            op.add_column(
                table_name,
                sa.Column(
                    "routing_profile",
                    postgresql.JSONB(),
                    nullable=False,
                    server_default=sa.text("'{}'::jsonb"),
                ),
            )
    columns = {column["name"] for column in inspector.get_columns("workflow_executions")}
    if "selection_mode" not in columns:
        op.add_column("workflow_executions", sa.Column("selection_mode", sa.String(16), nullable=False, server_default="manual"))
    if "selection_reason" not in columns:
        op.add_column("workflow_executions", sa.Column("selection_reason", sa.Text()))
    if "selection_fallback" not in columns:
        op.add_column("workflow_executions", sa.Column("selection_fallback", sa.Boolean(), nullable=False, server_default=sa.false()))


def downgrade() -> None:
    # Migration is intentionally additive: production execution provenance is retained.
    pass
