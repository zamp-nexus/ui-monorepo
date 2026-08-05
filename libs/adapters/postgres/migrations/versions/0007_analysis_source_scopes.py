"""Persist immutable Organization-wide analytical source scopes."""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql


revision = "0007_analysis_source_scopes"
down_revision = "0006_execution_job_kind"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "analysis_source_scopes",
        sa.Column("source_scope_id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("organization_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("fingerprint", sa.String(64), nullable=False),
        sa.Column("created_at", sa.TIMESTAMP(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["organization_id"], ["organizations.organization_id"], ondelete="CASCADE"),
        sa.UniqueConstraint("source_scope_id", "organization_id", name="uq_analysis_source_scopes_organization_identity"),
    )
    op.create_index("ix_analysis_source_scopes_organization", "analysis_source_scopes", ["organization_id"])
    op.create_table(
        "analysis_source_scope_members",
        sa.Column("source_scope_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("data_source_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("catalog_version_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("source_kind", sa.String(16), nullable=False),
        sa.Column("execution_capability", sa.String(32), nullable=False),
        sa.Column("relation_fingerprint", sa.String(64), nullable=False),
        sa.Column("position", sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(["source_scope_id"], ["analysis_source_scopes.source_scope_id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["data_source_id"], ["data_sources.data_source_id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["catalog_version_id"], ["catalog_versions.catalog_version_id"], ondelete="RESTRICT"),
        sa.UniqueConstraint("source_scope_id", "data_source_id", name="uq_analysis_source_scope_members_source"),
        sa.UniqueConstraint("source_scope_id", "position", name="uq_analysis_source_scope_members_position"),
        sa.CheckConstraint("position >= 0", name="ck_analysis_source_scope_members_position"),
    )
    op.add_column("chat_sessions", sa.Column("source_scope_id", postgresql.UUID(as_uuid=True)))
    op.add_column(
        "chat_sessions",
        sa.Column("source_ids", postgresql.JSONB(), nullable=False, server_default=sa.text("'[]'::jsonb")),
    )
    op.create_foreign_key("fk_chat_sessions_source_scope", "chat_sessions", "analysis_source_scopes", ["source_scope_id"], ["source_scope_id"], ondelete="RESTRICT")
    op.drop_column("chat_sessions", "default_data_connection_id")
    op.add_column("analysis_runs", sa.Column("source_scope_id", postgresql.UUID(as_uuid=True)))
    op.create_foreign_key("fk_analysis_runs_source_scope", "analysis_runs", "analysis_source_scopes", ["source_scope_id"], ["source_scope_id"], ondelete="RESTRICT")


def downgrade() -> None:
    op.drop_constraint("fk_analysis_runs_source_scope", "analysis_runs", type_="foreignkey")
    op.drop_column("analysis_runs", "source_scope_id")
    op.add_column("chat_sessions", sa.Column("default_data_connection_id", postgresql.UUID(as_uuid=True)))
    op.drop_column("chat_sessions", "source_ids")
    op.drop_constraint("fk_chat_sessions_source_scope", "chat_sessions", type_="foreignkey")
    op.drop_column("chat_sessions", "source_scope_id")
    op.drop_table("analysis_source_scope_members")
    op.drop_index("ix_analysis_source_scopes_organization", table_name="analysis_source_scopes")
    op.drop_table("analysis_source_scopes")
