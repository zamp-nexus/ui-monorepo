from sqlalchemy import (
    JSON,
    TIMESTAMP,
    CheckConstraint,
    Column,
    ForeignKeyConstraint,
    Index,
    Integer,
    Numeric,
    String,
    Table,
    Text,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import UUID

from ._metadata import metadata

activity_events = Table(
    "activity_events",
    metadata,
    Column("event_id", UUID(as_uuid=True), primary_key=True),
    Column("tenant_id", UUID(as_uuid=True), nullable=False),
    Column("chat_session_id", UUID(as_uuid=True), nullable=False),
    Column("sequence", Integer, nullable=False),
    Column("kind", String(64), nullable=False),
    Column("payload", JSON, nullable=False),
    Column("occurred_at", TIMESTAMP(timezone=True), nullable=False),
    ForeignKeyConstraint(
        ("chat_session_id", "tenant_id"),
        ("chat_sessions.chat_session_id", "chat_sessions.tenant_id"),
        name="fk_activity_events_chat_session_tenant",
        ondelete="CASCADE",
    ),
    UniqueConstraint(
        "chat_session_id", "sequence", name="uq_activity_events_sequence"
    ),
    CheckConstraint("sequence >= 1", name="ck_activity_events_sequence"),
)
Index(
    "ix_activity_events_tenant_chat_session_sequence",
    activity_events.c.tenant_id,
    activity_events.c.chat_session_id,
    activity_events.c.sequence,
)


visualization_briefs = Table(
    "visualization_briefs",
    metadata,
    Column("brief_id", UUID(as_uuid=True), primary_key=True),
    Column("tenant_id", UUID(as_uuid=True), nullable=False),
    Column("analysis_run_id", UUID(as_uuid=True), nullable=False),
    Column("schema_version", String(16), nullable=False),
    Column("content", JSON),
    Column("content_hash", String(64), nullable=False),
    Column("renderer_configuration", String(200), nullable=False),
    Column("created_at", TIMESTAMP(timezone=True), nullable=False),
    ForeignKeyConstraint(
        ("analysis_run_id", "tenant_id"),
        ("analysis_runs.analysis_run_id", "analysis_runs.tenant_id"),
        name="fk_visualization_briefs_analysis_run_tenant",
        ondelete="CASCADE",
    ),
    UniqueConstraint(
        "tenant_id",
        "analysis_run_id",
        "schema_version",
        "content_hash",
        "renderer_configuration",
        name="uq_visualization_briefs_identity",
    ),
    UniqueConstraint(
        "brief_id", "tenant_id", name="uq_visualization_briefs_tenant_identity"
    ),
)


visualization_artifacts = Table(
    "visualization_artifacts",
    metadata,
    Column("visualization_id", UUID(as_uuid=True), primary_key=True),
    Column("tenant_id", UUID(as_uuid=True), nullable=False),
    Column("analysis_run_id", UUID(as_uuid=True), nullable=False),
    Column(
        "brief_id",
        UUID(as_uuid=True),
        nullable=False,
    ),
    Column("status", String(24), nullable=False, server_default="pending"),
    Column("renderer_kind", String(32), nullable=False, server_default="thesys_c1"),
    Column("model", Text),
    Column("api_version", String(32)),
    Column("c1_response", Text),
    Column("input_tokens", Integer, nullable=False, server_default="0"),
    Column("output_tokens", Integer, nullable=False, server_default="0"),
    Column("cost_usd", Numeric(12, 6), nullable=False, server_default="0"),
    Column("latency_ms", Integer, nullable=False, server_default="0"),
    Column("failure_category", String(64)),
    Column("retry_of_visualization_id", UUID(as_uuid=True)),
    Column("retry_ordinal", Integer, nullable=False, server_default="0"),
    Column("created_at", TIMESTAMP(timezone=True), nullable=False),
    Column("updated_at", TIMESTAMP(timezone=True), nullable=False),
    Column("erased_at", TIMESTAMP(timezone=True)),
    Column("erasure_category", String(32)),
    ForeignKeyConstraint(
        ("brief_id", "tenant_id"),
        ("visualization_briefs.brief_id", "visualization_briefs.tenant_id"),
        name="fk_visualization_artifacts_brief_tenant",
        ondelete="CASCADE",
    ),
    ForeignKeyConstraint(
        ("analysis_run_id", "tenant_id"),
        ("analysis_runs.analysis_run_id", "analysis_runs.tenant_id"),
        name="fk_visualization_artifacts_analysis_run_tenant",
        ondelete="CASCADE",
    ),
    ForeignKeyConstraint(
        ("retry_of_visualization_id", "tenant_id"),
        (
            "visualization_artifacts.visualization_id",
            "visualization_artifacts.tenant_id",
        ),
        name="fk_visualization_artifacts_retry_tenant",
        ondelete="RESTRICT",
    ),
    UniqueConstraint(
        "brief_id", "retry_ordinal", name="uq_visualization_artifacts_retry_ordinal"
    ),
    UniqueConstraint(
        "visualization_id",
        "tenant_id",
        name="uq_visualization_artifacts_tenant_identity",
    ),
    CheckConstraint(
        "status IN ('pending', 'generating', 'ready', 'failed', 'tombstoned')",
        name="ck_visualization_artifacts_status",
    ),
    CheckConstraint(
        "input_tokens >= 0 AND output_tokens >= 0 AND cost_usd >= 0 "
        "AND latency_ms >= 0 AND retry_ordinal >= 0",
        name="ck_visualization_artifacts_usage",
    ),
)


visualization_actions = Table(
    "visualization_actions",
    metadata,
    Column("action_id", UUID(as_uuid=True), primary_key=True),
    Column("tenant_id", UUID(as_uuid=True), nullable=False),
    Column("visualization_id", UUID(as_uuid=True), nullable=False),
    Column("chat_session_id", UUID(as_uuid=True), nullable=False),
    Column("analysis_run_id", UUID(as_uuid=True), nullable=False),
    Column("kind", String(32), nullable=False),
    Column("label", String(80), nullable=False),
    Column("citation_id", UUID(as_uuid=True)),
    Column("follow_up_message", Text),
    Column("expires_at", TIMESTAMP(timezone=True), nullable=False),
    Column("single_use", Integer, nullable=False, server_default="0"),
    Column("consumed_at", TIMESTAMP(timezone=True)),
    Column("created_at", TIMESTAMP(timezone=True), nullable=False),
    ForeignKeyConstraint(
        ("visualization_id", "tenant_id"),
        (
            "visualization_artifacts.visualization_id",
            "visualization_artifacts.tenant_id",
        ),
        name="fk_visualization_actions_artifact_tenant",
        ondelete="CASCADE",
    ),
    ForeignKeyConstraint(
        ("chat_session_id", "tenant_id"),
        ("chat_sessions.chat_session_id", "chat_sessions.tenant_id"),
        name="fk_visualization_actions_chat_session_tenant",
        ondelete="CASCADE",
    ),
    ForeignKeyConstraint(
        ("analysis_run_id", "tenant_id"),
        ("analysis_runs.analysis_run_id", "analysis_runs.tenant_id"),
        name="fk_visualization_actions_analysis_run_tenant",
        ondelete="CASCADE",
    ),
    CheckConstraint(
        "kind IN ('continue_conversation', 'open_citation')",
        name="ck_visualization_actions_kind",
    ),
    CheckConstraint(
        "(kind = 'open_citation' AND citation_id IS NOT NULL "
        "AND follow_up_message IS NULL) OR "
        "(kind = 'continue_conversation' AND citation_id IS NULL "
        "AND follow_up_message IS NOT NULL)",
        name="ck_visualization_actions_mapping",
    ),
    CheckConstraint("single_use IN (0, 1)", name="ck_visualization_actions_single_use"),
)
