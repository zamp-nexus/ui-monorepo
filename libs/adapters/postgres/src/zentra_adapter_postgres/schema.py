from __future__ import annotations

from sqlalchemy import (
    JSON,
    TIMESTAMP,
    Boolean,
    CheckConstraint,
    Column,
    ForeignKey,
    Index,
    Integer,
    MetaData,
    Numeric,
    String,
    Table,
    Text,
    UniqueConstraint,
    text,
)
from sqlalchemy.dialects.postgresql import UUID

metadata = MetaData()

tenants = Table(
    "tenants",
    metadata,
    Column(
        "tenant_id",
        UUID(as_uuid=True),
        primary_key=True,
        server_default=text("gen_random_uuid()"),
    ),
    Column("name", Text, nullable=False),
    Column("data_residency_zone", Text, nullable=False, server_default="us-east"),
    Column(
        "confidence_threshold", Numeric(4, 3), nullable=False, server_default="0.700"
    ),
    Column("cost_ceiling_usd", Numeric(12, 4), nullable=False, server_default="2.0000"),
    Column(
        "created_at",
        TIMESTAMP(timezone=True),
        nullable=False,
        server_default=text("now()"),
    ),
    CheckConstraint(
        "confidence_threshold >= 0 AND confidence_threshold <= 1",
        name="ck_tenants_confidence_threshold",
    ),
    CheckConstraint("cost_ceiling_usd >= 0", name="ck_tenants_cost_ceiling"),
)

users = Table(
    "users",
    metadata,
    Column(
        "user_id",
        UUID(as_uuid=True),
        primary_key=True,
        server_default=text("gen_random_uuid()"),
    ),
    Column("email", Text, nullable=False),
    Column("display_name", Text),
    Column(
        "created_at",
        TIMESTAMP(timezone=True),
        nullable=False,
        server_default=text("now()"),
    ),
)

identity_subjects = Table(
    "identity_subjects",
    metadata,
    Column("provider", String(32), primary_key=True),
    Column("external_subject_id", Text, primary_key=True),
    Column(
        "user_id",
        UUID(as_uuid=True),
        ForeignKey("users.user_id", ondelete="CASCADE"),
        nullable=False,
    ),
    Column(
        "created_at",
        TIMESTAMP(timezone=True),
        nullable=False,
        server_default=text("now()"),
    ),
    UniqueConstraint("provider", "user_id", name="uq_identity_subject_provider_user"),
)

tenant_identity_bindings = Table(
    "tenant_identity_bindings",
    metadata,
    Column("provider", String(32), primary_key=True),
    Column("external_tenant_id", Text, primary_key=True),
    Column(
        "tenant_id",
        UUID(as_uuid=True),
        ForeignKey("tenants.tenant_id", ondelete="CASCADE"),
        nullable=False,
        unique=True,
    ),
    Column(
        "created_at",
        TIMESTAMP(timezone=True),
        nullable=False,
        server_default=text("now()"),
    ),
)

tenant_memberships = Table(
    "tenant_memberships",
    metadata,
    Column(
        "tenant_id",
        UUID(as_uuid=True),
        ForeignKey("tenants.tenant_id", ondelete="CASCADE"),
        primary_key=True,
    ),
    Column(
        "user_id",
        UUID(as_uuid=True),
        ForeignKey("users.user_id", ondelete="CASCADE"),
        primary_key=True,
    ),
    Column("role", String(16), nullable=False),
    Column(
        "created_at",
        TIMESTAMP(timezone=True),
        nullable=False,
        server_default=text("now()"),
    ),
    CheckConstraint(
        "role IN ('owner', 'admin', 'member', 'viewer')",
        name="ck_tenant_memberships_role",
    ),
)

investigations = Table(
    "investigations",
    metadata,
    Column(
        "investigation_id",
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
    Column("question", Text, nullable=False),
    Column("status", String(32), nullable=False, server_default="in_progress"),
    Column("state", JSON, nullable=False, server_default=text("'{}'::jsonb")),
    Column("cost_so_far_usd", Numeric(12, 4), nullable=False, server_default="0"),
    Column(
        "created_at",
        TIMESTAMP(timezone=True),
        nullable=False,
        server_default=text("now()"),
    ),
    Column("resolved_at", TIMESTAMP(timezone=True)),
    CheckConstraint(
        "status IN ('in_progress', 'pending_review', 'resolved', 'cost_limited')",
        name="ck_investigations_status",
    ),
    CheckConstraint("cost_so_far_usd >= 0", name="ck_investigations_cost"),
)
Index(
    "ix_investigations_tenant_created",
    investigations.c.tenant_id,
    investigations.c.created_at,
)

agent_executions = Table(
    "agent_executions",
    metadata,
    Column(
        "execution_id",
        UUID(as_uuid=True),
        primary_key=True,
        server_default=text("gen_random_uuid()"),
    ),
    Column(
        "investigation_id",
        UUID(as_uuid=True),
        ForeignKey("investigations.investigation_id", ondelete="CASCADE"),
        nullable=False,
    ),
    Column(
        "tenant_id",
        UUID(as_uuid=True),
        ForeignKey("tenants.tenant_id", ondelete="CASCADE"),
        nullable=False,
    ),
    Column("agent_id", Text, nullable=False),
    Column("step", Integer, nullable=False),
    Column("input", JSON, nullable=False),
    Column("output", JSON),
    Column("outcome_kind", String(16)),
    Column("confidence", Numeric(4, 3)),
    Column("outcome", JSON),
    Column("status", String(16), nullable=False),
    Column("latency_ms", Integer),
    Column("cost_usd", Numeric(12, 6)),
    Column("model", Text),
    Column(
        "started_at",
        TIMESTAMP(timezone=True),
        nullable=False,
        server_default=text("now()"),
    ),
    Column("completed_at", TIMESTAMP(timezone=True)),
    CheckConstraint("step >= 0", name="ck_agent_executions_step"),
    CheckConstraint(
        "status IN ('success', 'failure', 'partial', 'escalated')",
        name="ck_agent_executions_status",
    ),
    CheckConstraint(
        "outcome_kind IS NULL OR outcome_kind IN ('confidence', 'validation')",
        name="ck_agent_executions_outcome_kind",
    ),
    CheckConstraint(
        "(outcome_kind = 'confidence' AND confidence BETWEEN 0 AND 1) "
        "OR (outcome_kind = 'validation' AND confidence IS NULL) "
        "OR (outcome_kind IS NULL AND confidence IS NULL)",
        name="ck_agent_executions_typed_outcome",
    ),
    CheckConstraint(
        "latency_ms IS NULL OR latency_ms >= 0", name="ck_agent_executions_latency"
    ),
    CheckConstraint(
        "cost_usd IS NULL OR cost_usd >= 0", name="ck_agent_executions_cost"
    ),
)
Index(
    "ix_agent_executions_tenant_investigation_step",
    agent_executions.c.tenant_id,
    agent_executions.c.investigation_id,
    agent_executions.c.step,
)

human_approvals = Table(
    "human_approvals",
    metadata,
    Column(
        "approval_id",
        UUID(as_uuid=True),
        primary_key=True,
        server_default=text("gen_random_uuid()"),
    ),
    Column(
        "investigation_id",
        UUID(as_uuid=True),
        ForeignKey("investigations.investigation_id", ondelete="CASCADE"),
        nullable=False,
    ),
    Column(
        "tenant_id",
        UUID(as_uuid=True),
        ForeignKey("tenants.tenant_id", ondelete="CASCADE"),
        nullable=False,
    ),
    Column("reason", String(64), nullable=False),
    Column("status", String(16), nullable=False, server_default="pending"),
    Column(
        "requested_at",
        TIMESTAMP(timezone=True),
        nullable=False,
        server_default=text("now()"),
    ),
    Column("decided_at", TIMESTAMP(timezone=True)),
    Column("decided_by", UUID(as_uuid=True), ForeignKey("users.user_id")),
    CheckConstraint(
        "reason IN ('low_confidence', 'irreversible_action', "
        "'contradiction_unresolved', 'regulatory_exposure', 'tenant_policy')",
        name="ck_human_approvals_reason",
    ),
    CheckConstraint(
        "status IN ('pending', 'granted', 'rejected', 'timed_out')",
        name="ck_human_approvals_status",
    ),
)
Index(
    "ix_human_approvals_tenant_status",
    human_approvals.c.tenant_id,
    human_approvals.c.status,
)

semantic_metrics = Table(
    "semantic_metrics",
    metadata,
    Column(
        "metric_id",
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
    Column("name", Text, nullable=False),
    Column("sql_definition", Text, nullable=False),
    Column("grain", Text, nullable=False),
    Column("description", Text),
    Column(
        "created_at",
        TIMESTAMP(timezone=True),
        nullable=False,
        server_default=text("now()"),
    ),
    UniqueConstraint("tenant_id", "name", name="uq_semantic_metrics_tenant_name"),
)

agent_registry = Table(
    "agent_registry",
    metadata,
    Column("agent_id", Text, primary_key=True),
    Column("role", String(64), nullable=False),
    Column("version", Text, nullable=False),
    Column("enabled", Boolean, nullable=False, server_default=text("false")),
    Column("eval_status", String(16), nullable=False, server_default="pending"),
    Column("eval_suite_ref", Text, nullable=False),
    CheckConstraint(
        "role IN ('orchestrator', 'data_intake', 'data_quality', 'data_preparation', "
        "'semantic_modeling', 'sql_analyst', 'evaluator', 'statistician', "
        "'insight_root_cause', 'demand_planner', 'forecaster', 'visualization', "
        "'executive_report_writer', 'knowledge')",
        name="ck_agent_registry_role",
    ),
    CheckConstraint(
        "eval_status IN ('pending', 'passing', 'failing')",
        name="ck_agent_registry_eval_status",
    ),
    CheckConstraint(
        "enabled = false OR eval_status = 'passing'",
        name="ck_agent_registry_enabled_requires_passing_eval",
    ),
)
