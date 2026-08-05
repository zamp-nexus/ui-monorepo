from __future__ import annotations

from sqlalchemy import (
    JSON,
    TIMESTAMP,
    Boolean,
    CheckConstraint,
    Column,
    ForeignKey,
    ForeignKeyConstraint,
    Index,
    Integer,
    Numeric,
    String,
    Table,
    Text,
    UniqueConstraint,
    text,
)
from sqlalchemy.dialects.postgresql import UUID
from zentra_domain_agent_execution import CANONICAL_ROLES

from ._metadata import metadata

# The Phase 2 tables live in their own module to keep this one under the
# repository's line limit. Re-exported here so every existing
# `from ...schema import draft_findings` keeps working — and so importing this
# module is what registers *every* table on the shared `MetaData`. Importing
# `._metadata` alone yields an empty one, and `create_all` would silently do
# nothing.
from .schema_connector import (
    catalog_agent_access,
    catalog_versions,
    data_sources,
    harvest_runs,
    relations,
)
from .schema_analysis_run_board import analysis_workspaces as analysis_workspaces
from .schema_analysis_run_board import analytical_scopes as analytical_scopes
from .schema_analysis_run_board import board_conflicts as board_conflicts
from .schema_analysis_run_board import board_facts as board_facts
from .schema_analysis_run_board import board_gaps as board_gaps
from .schema_analysis_run_board import board_hypotheses as board_hypotheses
from .schema_analysis_run_board import work_items as work_items
from .schema_phase_2 import (
    draft_finding_claim_citations,
    draft_finding_claims,
    draft_findings,
    erasure_operations,
    evidence_citations,
)
from .schema_sequence import prepared_tables as prepared_tables
from .schema_sequence import sequence_final_tables as sequence_final_tables
from .schema_sequence import sequence_runs as sequence_runs
from .schema_sequence import sequence_steps as sequence_steps
from .schema_sequence import sequences as sequences
from .schema_threads import chat_sessions as chat_sessions
from .schema_threads import messages as messages
from .schema_workspace import workspace_groups as workspace_groups


def _role_check() -> str:
    """The canonical write vocabulary, as a CHECK body.

    Sorted so the emitted DDL is stable — an unordered frozenset would make
    every schema diff look like a change.
    """
    values = ", ".join(f"'{role.value}'" for role in sorted(CANONICAL_ROLES))
    return f"role IN ({values})"


organizations = Table(
    "organizations",
    metadata,
    Column(
        "organization_id",
        UUID(as_uuid=True),
        primary_key=True,
        server_default=text("gen_random_uuid()"),
    ),
    Column("name", Text, nullable=False),
    Column("data_residency_zone", Text, nullable=False, server_default="us-east"),
    Column("model_tier", String(16), nullable=False, server_default="free"),
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
        name="ck_organizations_confidence_threshold",
    ),
    CheckConstraint("cost_ceiling_usd >= 0", name="ck_organizations_cost_ceiling"),
    CheckConstraint(
        "model_tier IN ('free', 'premium')",
        name="ck_organizations_model_tier",
    ),
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

organization_identity_bindings = Table(
    "organization_identity_bindings",
    metadata,
    Column("provider", String(32), primary_key=True),
    Column("external_organization_id", Text, primary_key=True),
    Column(
        "organization_id",
        UUID(as_uuid=True),
        ForeignKey("organizations.organization_id", ondelete="CASCADE"),
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

organization_memberships = Table(
    "organization_memberships",
    metadata,
    Column(
        "organization_id",
        UUID(as_uuid=True),
        ForeignKey("organizations.organization_id", ondelete="CASCADE"),
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
        name="ck_organization_memberships_role",
    ),
)

analysis_runs = Table(
    "analysis_runs",
    metadata,
    Column(
        "analysis_run_id",
        UUID(as_uuid=True),
        primary_key=True,
        server_default=text("gen_random_uuid()"),
    ),
    Column(
        "organization_id",
        UUID(as_uuid=True),
        ForeignKey("organizations.organization_id", ondelete="CASCADE"),
        nullable=False,
    ),
    Column("question", Text, nullable=False),
    Column("status", String(32), nullable=False, server_default="pending"),
    Column("state", JSON, nullable=False, server_default=text("'{}'::jsonb")),
    Column("scenario_key", String(64)),
    Column("chat_session_id", UUID(as_uuid=True)),
    Column("chat_sequence", Integer),
    Column("initiating_message_id", UUID(as_uuid=True)),
    Column("parent_analysis_run_id", UUID(as_uuid=True)),
    Column("retry_of_analysis_run_id", UUID(as_uuid=True)),
    Column("version", Integer, nullable=False, server_default="1"),
    Column("evaluation_attempts", Integer, nullable=False, server_default="0"),
    Column("cost_so_far_usd", Numeric(12, 4), nullable=False, server_default="0"),
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
    Column("finished_at", TIMESTAMP(timezone=True)),
    CheckConstraint(
        "status IN ('pending', 'running', 'evaluating', 'awaiting_approval', "
        "'completed', 'rejected', 'failed', 'cancelled')",
        name="ck_analysis_runs_status",
    ),
    CheckConstraint("cost_so_far_usd >= 0", name="ck_analysis_runs_cost"),
    CheckConstraint("version >= 1", name="ck_analysis_runs_version"),
    CheckConstraint(
        "evaluation_attempts >= 0 AND evaluation_attempts <= 3",
        name="ck_analysis_runs_evaluation_attempts",
    ),
    CheckConstraint(
        "(chat_session_id IS NULL AND chat_sequence IS NULL AND "
        "initiating_message_id IS NULL) OR "
        "(chat_session_id IS NOT NULL AND chat_sequence >= 1 AND "
        "initiating_message_id IS NOT NULL)",
        name="ck_analysis_runs_chat_session_link",
    ),
    ForeignKeyConstraint(
        ("chat_session_id", "organization_id"),
        ("chat_sessions.chat_session_id", "chat_sessions.organization_id"),
        name="fk_analysis_runs_chat_session_organization",
        ondelete="RESTRICT",
    ),
    ForeignKeyConstraint(
        ("initiating_message_id", "chat_session_id", "organization_id"),
        (
            "messages.message_id",
            "messages.chat_session_id",
            "messages.organization_id",
        ),
        name="fk_analysis_runs_initiating_message",
        ondelete="RESTRICT",
    ),
    ForeignKeyConstraint(
        ("parent_analysis_run_id", "organization_id"),
        ("analysis_runs.analysis_run_id", "analysis_runs.organization_id"),
        name="fk_analysis_runs_parent_organization",
        ondelete="RESTRICT",
    ),
    ForeignKeyConstraint(
        ("retry_of_analysis_run_id", "organization_id"),
        ("analysis_runs.analysis_run_id", "analysis_runs.organization_id"),
        name="fk_analysis_runs_retry_organization",
        ondelete="RESTRICT",
    ),
    UniqueConstraint(
        "chat_session_id", "chat_sequence", name="uq_analysis_runs_chat_sequence"
    ),
    UniqueConstraint(
        "analysis_run_id",
        "organization_id",
        name="uq_analysis_runs_organization_identity",
    ),
)
Index(
    "ix_analysis_runs_organization_created",
    analysis_runs.c.organization_id,
    analysis_runs.c.created_at,
)

# Workflow Studio V1 keeps the editable canvas separate from immutable
# published snapshots. Custom Workflows are intentionally not connected to the
# Analysis Run runtime yet; these tables persist authored definitions only.
workflow_definitions = Table(
    "workflow_definitions",
    metadata,
    Column(
        "workflow_id",
        UUID(as_uuid=True),
        primary_key=True,
        server_default=text("gen_random_uuid()"),
    ),
    Column(
        "organization_id",
        UUID(as_uuid=True),
        ForeignKey("organizations.organization_id", ondelete="CASCADE"),
        nullable=False,
    ),
    Column("name", Text, nullable=False),
    Column("draft_definition", JSON, nullable=False),
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
    UniqueConstraint("workflow_id", "organization_id", name="uq_workflows_organization_identity"),
)
Index("ix_workflows_organization_updated", workflow_definitions.c.organization_id, workflow_definitions.c.updated_at)

workflow_versions = Table(
    "workflow_versions",
    metadata,
    Column(
        "workflow_version_id",
        UUID(as_uuid=True),
        primary_key=True,
        server_default=text("gen_random_uuid()"),
    ),
    Column(
        "workflow_id",
        UUID(as_uuid=True),
        ForeignKey("workflow_definitions.workflow_id", ondelete="CASCADE"),
        nullable=False,
    ),
    Column(
        "organization_id",
        UUID(as_uuid=True),
        ForeignKey("organizations.organization_id", ondelete="CASCADE"),
        nullable=False,
    ),
    Column("version", Integer, nullable=False),
    Column("definition", JSON, nullable=False),
    Column("published_by_user_id", UUID(as_uuid=True), ForeignKey("users.user_id"), nullable=False),
    Column(
        "published_at",
        TIMESTAMP(timezone=True),
        nullable=False,
        server_default=text("now()"),
    ),
    UniqueConstraint("workflow_id", "version", name="uq_workflow_versions_number"),
)
Index("ix_workflow_versions_organization_published", workflow_versions.c.organization_id, workflow_versions.c.published_at)

workflow_executions = Table(
    "workflow_executions",
    metadata,
    Column("workflow_execution_id", UUID(as_uuid=True), primary_key=True),
    Column("organization_id", UUID(as_uuid=True), ForeignKey("organizations.organization_id", ondelete="CASCADE"), nullable=False),
    Column("workflow_id", UUID(as_uuid=True), nullable=True),
    Column("workflow_version", Integer, nullable=False),
    Column("workflow_name", Text, nullable=False),
    Column("status", String(16), nullable=False),
    Column("nodes", JSON, nullable=False, server_default=text("'[]'::jsonb")),
    Column("routes", JSON, nullable=False, server_default=text("'[]'::jsonb")),
    Column("output", Text),
    Column("error", Text),
    Column("created_at", TIMESTAMP(timezone=True), nullable=False, server_default=text("now()")),
    Column("finished_at", TIMESTAMP(timezone=True)),
    CheckConstraint("status IN ('running', 'completed', 'failed')", name="ck_workflow_executions_status"),
)
Index("ix_workflow_executions_organization_created", workflow_executions.c.organization_id, workflow_executions.c.created_at)

# `messages.analysis_run_id` is declared in schema_threads.py, before this
# table exists — added here with the same deferred, use_alter pattern
# `chat_sessions.initiating_message_id` already uses against `messages`,
# for the same reason: a circular reference between the two tables.
messages.append_constraint(
    ForeignKeyConstraint(
        ("analysis_run_id", "organization_id"),
        ("analysis_runs.analysis_run_id", "analysis_runs.organization_id"),
        name="fk_messages_analysis_run_organization",
        ondelete="RESTRICT",
        deferrable=True,
        initially="DEFERRED",
        use_alter=True,
    )
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
        "analysis_run_id",
        UUID(as_uuid=True),
        ForeignKey("analysis_runs.analysis_run_id", ondelete="CASCADE"),
        nullable=False,
    ),
    Column(
        "organization_id",
        UUID(as_uuid=True),
        ForeignKey("organizations.organization_id", ondelete="CASCADE"),
        nullable=False,
    ),
    Column("agent_id", Text, nullable=False),
    Column("role", String(64)),
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
    Column("provider", String(64)),
    Column("input_tokens", Integer, nullable=False, server_default="0"),
    Column("output_tokens", Integer, nullable=False, server_default="0"),
    Column("fallbacks", JSON, nullable=False, server_default="[]"),
    # Which tools the Agent ran, in order: name, latency, ok. Never arguments
    # or results — those carry rows, and this table is read by Replay.
    Column("tool_calls", JSON, nullable=False, server_default="[]"),
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
    CheckConstraint(
        "input_tokens >= 0 AND output_tokens >= 0",
        name="ck_agent_executions_tokens",
    ),
)
Index(
    "ix_agent_executions_organization_analysis_run_step",
    agent_executions.c.organization_id,
    agent_executions.c.analysis_run_id,
    agent_executions.c.step,
)

# Phase 2. Additive: the Phase 1 narrative Finding stays where it is, inside
# `analysis_runs.state`, and is neither moved nor rewritten. A structured draft
# is a separate row an Analysis Run may or may not have, so an Analysis Run
# that ran before Insight existed reads back exactly as it did.
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
        "analysis_run_id",
        UUID(as_uuid=True),
        ForeignKey("analysis_runs.analysis_run_id", ondelete="CASCADE"),
        nullable=False,
    ),
    Column(
        "organization_id",
        UUID(as_uuid=True),
        ForeignKey("organizations.organization_id", ondelete="CASCADE"),
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
    Column("decision_reason", String(32)),
    # Every publication condition that failed. `reason` is the headline;
    # this is the whole picture a reviewer needs.
    Column("failed_conditions", JSON, nullable=False, server_default="[]"),
    CheckConstraint(
        "reason IN ('low_confidence', 'irreversible_action', "
        "'contradiction_unresolved', 'regulatory_exposure', 'organization_policy', "
        "'evidence_incomplete')",
        name="ck_human_approvals_reason",
    ),
    CheckConstraint(
        "status IN ('pending', 'granted', 'rejected', 'timed_out')",
        name="ck_human_approvals_status",
    ),
    CheckConstraint(
        "decision_reason IS NULL OR decision_reason IN "
        "('insufficient_evidence', 'incorrect_interpretation', "
        "'policy_mismatch', 'needs_more_analysis')",
        name="ck_human_approvals_decision_reason",
    ),
)
Index(
    "ix_human_approvals_organization_status",
    human_approvals.c.organization_id,
    human_approvals.c.status,
)
Index(
    "uq_human_approvals_one_pending",
    human_approvals.c.organization_id,
    human_approvals.c.analysis_run_id,
    unique=True,
    postgresql_where=human_approvals.c.status == "pending",
)

audit_outbox = Table(
    "audit_outbox",
    metadata,
    Column("event_id", UUID(as_uuid=True), primary_key=True),
    Column(
        "organization_id",
        UUID(as_uuid=True),
        ForeignKey("organizations.organization_id", ondelete="CASCADE"),
        nullable=False,
    ),
    Column(
        "analysis_run_id",
        UUID(as_uuid=True),
        ForeignKey("analysis_runs.analysis_run_id", ondelete="CASCADE"),
        nullable=False,
    ),
    Column("payload", JSON, nullable=False),
    Column(
        "created_at",
        TIMESTAMP(timezone=True),
        nullable=False,
        server_default=text("now()"),
    ),
    Column("dispatched_at", TIMESTAMP(timezone=True)),
    Column("attempts", Integer, nullable=False, server_default="0"),
    Column("last_error_code", String(64)),
    CheckConstraint("attempts >= 0", name="ck_audit_outbox_attempts"),
)
# The ordering floor reads the latest `created_at` for one Analysis Run on
# every enqueue. Without this it is a sequential scan over all history, in
# the request path.
Index(
    "ix_audit_outbox_analysis_run_created",
    audit_outbox.c.analysis_run_id,
    audit_outbox.c.created_at,
)
Index(
    "ix_audit_outbox_organization_pending",
    audit_outbox.c.organization_id,
    audit_outbox.c.dispatched_at,
    audit_outbox.c.created_at,
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
        "organization_id",
        UUID(as_uuid=True),
        ForeignKey("organizations.organization_id", ondelete="CASCADE"),
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
    UniqueConstraint(
        "organization_id", "name", name="uq_semantic_metrics_organization_name"
    ),
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
    Column("display_name", Text),
    Column("description", Text),
    Column("capabilities", JSON, nullable=False, server_default="[]"),
    # Derived from the enum rather than restated, because a hand-kept copy of
    # this list is exactly the kind of drift nothing would catch. Legacy roles
    # are excluded: this is the canonical *write* vocabulary, and `0005`
    # re-adds the constraint NOT VALID so a database already holding a legacy
    # row keeps it readable while refusing to accept another one.
    CheckConstraint(_role_check(), name="ck_agent_registry_role"),
    CheckConstraint(
        "eval_status IN ('pending', 'passing', 'failing')",
        name="ck_agent_registry_eval_status",
    ),
    CheckConstraint(
        "enabled = false OR eval_status = 'passing'",
        name="ck_agent_registry_enabled_requires_passing_eval",
    ),
)

# Imported after `analysis_runs` is registered because the job table carries
# a composite Organization-safe foreign key to it.
from .schema_chat import (  # noqa: E402
    activity_events as activity_events,
)
from .schema_chat import (  # noqa: E402
    visualization_actions as visualization_actions,
)
from .schema_chat import (  # noqa: E402
    visualization_artifacts as visualization_artifacts,
)
from .schema_chat import (  # noqa: E402
    visualization_briefs as visualization_briefs,
)
from .schema_jobs import execution_jobs as execution_jobs  # noqa: E402

__all__ = [
    "activity_events",
    "agent_executions",
    "agent_registry",
    "analysis_runs",
    "audit_outbox",
    "catalog_agent_access",
    "catalog_versions",
    "chat_sessions",
    "data_sources",
    "draft_finding_claim_citations",
    "draft_finding_claims",
    "draft_findings",
    "erasure_operations",
    "evidence_citations",
    "execution_jobs",
    "harvest_runs",
    "human_approvals",
    "identity_subjects",
    "messages",
    "metadata",
    "prepared_tables",
    "relations",
    "semantic_metrics",
    "sequence_final_tables",
    "sequence_runs",
    "sequence_steps",
    "sequences",
    "organization_identity_bindings",
    "organization_memberships",
    "organizations",
    "users",
    "visualization_actions",
    "visualization_artifacts",
    "visualization_briefs",
    "workspace_groups",
]
