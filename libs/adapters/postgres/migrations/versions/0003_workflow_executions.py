"""Persist Workflow Engine execution traces."""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "0003_workflow_executions"
down_revision = "0002_workflow_studio"
branch_labels = None
depends_on = None


def upgrade() -> None:
    if sa.inspect(op.get_bind()).has_table("workflow_executions"):
        return
    op.create_table(
        "workflow_executions",
        sa.Column("workflow_execution_id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("organization_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("organizations.organization_id", ondelete="CASCADE"), nullable=False),
        sa.Column("workflow_id", postgresql.UUID(as_uuid=True)),
        sa.Column("workflow_version", sa.Integer(), nullable=False),
        sa.Column("workflow_name", sa.Text(), nullable=False),
        sa.Column("thread_id", postgresql.UUID(as_uuid=True)),
        sa.Column("status", sa.String(length=16), nullable=False),
        sa.Column("nodes", postgresql.JSONB(), nullable=False, server_default=sa.text("'[]'::jsonb")),
        sa.Column("routes", postgresql.JSONB(), nullable=False, server_default=sa.text("'[]'::jsonb")),
        sa.Column("output", sa.Text()),
        sa.Column("error", sa.Text()),
        sa.Column("created_at", sa.TIMESTAMP(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("finished_at", sa.TIMESTAMP(timezone=True)),
        sa.CheckConstraint("status IN ('running', 'completed', 'failed')", name="ck_workflow_executions_status"),
    )
    op.create_index("ix_workflow_executions_organization_created", "workflow_executions", ["organization_id", "created_at"])
    op.create_index("ix_workflow_executions_thread_created", "workflow_executions", ["thread_id", "created_at"])


def downgrade() -> None:
    op.drop_index("ix_workflow_executions_thread_created", table_name="workflow_executions")
    op.drop_index("ix_workflow_executions_organization_created", table_name="workflow_executions")
    op.drop_table("workflow_executions")
