from sqlalchemy import (
    TIMESTAMP,
    CheckConstraint,
    Column,
    ForeignKey,
    ForeignKeyConstraint,
    Index,
    Integer,
    String,
    Table,
    Text,
    UniqueConstraint,
    text,
)
from sqlalchemy.dialects.postgresql import UUID

from ._metadata import metadata

chat_sessions = Table(
    "chat_sessions",
    metadata,
    Column(
        "chat_session_id",
        UUID(as_uuid=True),
        primary_key=True,
        server_default=text("gen_random_uuid()"),
    ),
    Column(
        "tenant_id",
        UUID(as_uuid=True),
        ForeignKey("tenants.tenant_id", ondelete="CASCADE"),
        nullable=False,
    ),
    Column("group_id", UUID(as_uuid=True), nullable=False),
    Column(
        "created_by",
        UUID(as_uuid=True),
        ForeignKey("users.user_id"),
        nullable=False,
    ),
    Column("visibility", String(16), nullable=False, server_default="shared"),
    Column("initiating_message_id", UUID(as_uuid=True), nullable=False),
    Column("title", Text, nullable=False),
    Column("status", String(16), nullable=False, server_default="draft"),
    Column("next_event_sequence", Integer, nullable=False, server_default="1"),
    Column("archived_from_status", String(16)),
    Column(
        "created_at",
        TIMESTAMP(timezone=True),
        nullable=False,
        server_default=text("now()"),
    ),
    Column(
        "updated_at",
        TIMESTAMP(timezone=True),
        nullable=False,
        server_default=text("now()"),
    ),
    Column(
        "latest_activity_at",
        TIMESTAMP(timezone=True),
        nullable=False,
        server_default=text("now()"),
    ),
    Column("archived_at", TIMESTAMP(timezone=True)),
    ForeignKeyConstraint(
        ("group_id", "tenant_id"),
        ("workspace_groups.group_id", "workspace_groups.tenant_id"),
        name="fk_chat_sessions_group_tenant",
        ondelete="CASCADE",
    ),
    UniqueConstraint(
        "chat_session_id", "tenant_id", name="uq_chat_sessions_tenant_identity"
    ),
    CheckConstraint(
        "status IN ('draft', 'active', 'archived')",
        name="ck_chat_sessions_status",
    ),
    CheckConstraint(
        "archived_from_status IS NULL OR archived_from_status IN ('draft', 'active')",
        name="ck_chat_sessions_archived_from",
    ),
    CheckConstraint(
        "char_length(title) BETWEEN 1 AND 80",
        name="ck_chat_sessions_title_length",
    ),
    CheckConstraint(
        "next_event_sequence >= 1",
        name="ck_chat_sessions_event_sequence",
    ),
    CheckConstraint(
        "visibility IN ('shared', 'private')",
        name="ck_chat_sessions_visibility",
    ),
)
Index(
    "ix_chat_sessions_group_activity",
    chat_sessions.c.tenant_id,
    chat_sessions.c.group_id,
    chat_sessions.c.latest_activity_at.desc(),
    chat_sessions.c.chat_session_id.desc(),
)


messages = Table(
    "messages",
    metadata,
    Column(
        "message_id",
        UUID(as_uuid=True),
        primary_key=True,
        server_default=text("gen_random_uuid()"),
    ),
    Column("chat_session_id", UUID(as_uuid=True), nullable=False),
    Column(
        "tenant_id",
        UUID(as_uuid=True),
        ForeignKey("tenants.tenant_id", ondelete="CASCADE"),
        nullable=False,
    ),
    Column("author_id", UUID(as_uuid=True)),
    Column("kind", String(32), nullable=False),
    Column("content", Text, nullable=False),
    # Set only on an 'assistant_reply' message that answered an analytical
    # question. NULL for every user/system/router message and for a
    # Conversational Agent's non-analytical reply — the Analysis Run FK is
    # added below, after `analysis_runs` exists (Task 3), the same
    # deferred-constraint pattern `chat_sessions.initiating_message_id`
    # already uses against this table.
    Column("analysis_run_id", UUID(as_uuid=True)),
    Column(
        "created_at",
        TIMESTAMP(timezone=True),
        nullable=False,
        server_default=text("now()"),
    ),
    ForeignKeyConstraint(
        ("chat_session_id", "tenant_id"),
        ("chat_sessions.chat_session_id", "chat_sessions.tenant_id"),
        name="fk_messages_chat_session_tenant",
        ondelete="CASCADE",
    ),
    UniqueConstraint(
        "message_id",
        "chat_session_id",
        "tenant_id",
        name="uq_messages_chat_session_tenant_identity",
    ),
    CheckConstraint(
        "kind IN ('user_question', 'user_clarification', "
        "'router_clarification', 'safe_system', 'assistant_reply')",
        name="ck_messages_kind",
    ),
    CheckConstraint(
        "analysis_run_id IS NULL OR kind = 'assistant_reply'",
        name="ck_messages_analysis_run_requires_assistant_reply",
    ),
    CheckConstraint(
        "char_length(content) BETWEEN 1 AND 4000",
        name="ck_messages_content_length",
    ),
)
Index(
    "ix_messages_chat_session_created",
    messages.c.tenant_id,
    messages.c.chat_session_id,
    messages.c.created_at,
    messages.c.message_id,
)

chat_sessions.append_constraint(
    ForeignKeyConstraint(
        ("initiating_message_id", "chat_session_id", "tenant_id"),
        (
            "messages.message_id",
            "messages.chat_session_id",
            "messages.tenant_id",
        ),
        name="fk_chat_sessions_initiating_message",
        deferrable=True,
        initially="DEFERRED",
        use_alter=True,
    )
)
