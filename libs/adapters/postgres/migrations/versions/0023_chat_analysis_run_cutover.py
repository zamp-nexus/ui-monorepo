"""Destructive reset: Project, Investigation Thread, Investigation, Work
Feed, and Investigation Board become Chat Session, Message, Analysis Run,
Activity Feed, and Analysis Workspace. No data migration -- see ADR-0030."""

from alembic import op

from zentra_adapter_postgres.schema import metadata

revision = "0023_chat_analysis_run_cutover"
down_revision = "0022_merge_heads"
branch_labels = None
depends_on = None

OLD_TABLES = (
    # Children first: Postgres enforces FK order even under CASCADE when
    # dropping one statement per table rather than DROP ... CASCADE.
    "board_conflicts",
    "board_gaps",
    "board_hypotheses",
    "board_facts",
    "investigation_boards",
    "visualization_actions",
    "visualization_artifacts",
    "visualization_briefs",
    "thread_events",
    "work_items",
    "execution_jobs",
    "audit_outbox",
    "human_approvals",
    "agent_executions",
    "draft_finding_claim_citations",
    "draft_finding_claims",
    "evidence_citations",
    "draft_findings",
    "erasure_operations",
    "investigations",
    "thread_messages",
    "investigation_threads",
    "projects",
)

NEW_TENANT_SCOPED_TABLES = (
    "chat_sessions",
    "messages",
    "analysis_runs",
    "activity_events",
    "analysis_workspaces",
)

# Dropped above and recreated here because their foreign-key column rename
# (investigation_id -> analysis_run_id, or board_id -> workspace_id) is part
# of the table definition the schema module already carries -- recreating
# from that already-correct metadata is simpler than hand-writing ALTER
# TABLE ... RENAME COLUMN for each one. Every one of these previously had
# its RLS policy installed by an earlier migration (0017, 0020); dropping
# and recreating the table drops that policy too, so it must be reinstalled
# here rather than assumed to still be there.
RECREATED_DEPENDENT_TABLES = (
    "agent_executions",
    "human_approvals",
    "audit_outbox",
    "work_items",
    "execution_jobs",
    "board_facts",
    "board_hypotheses",
    "board_gaps",
    "board_conflicts",
    "visualization_briefs",
    "visualization_artifacts",
    "visualization_actions",
    "draft_findings",
    "draft_finding_claims",
    "evidence_citations",
    "draft_finding_claim_citations",
    "erasure_operations",
)


# Every table defaults to full CRUD. The three exceptions here are
# deliberate, pre-existing restrictions carried over from the migrations
# that originally installed them (0015, 0017) -- Messages are append-only
# (no UPDATE/DELETE), Activity Feed events are an immutable log (no
# UPDATE/DELETE), and Visualization Briefs are append-and-refine but never
# deleted (no DELETE). Losing these when this revision recreates the
# tables would silently widen what the runtime role can do to them.
RESTRICTED_GRANTS = {
    "messages": "SELECT, INSERT",
    "activity_events": "SELECT, INSERT",
    "visualization_briefs": "SELECT, INSERT, UPDATE",
    "visualization_artifacts": "SELECT, INSERT, UPDATE",
}
DEFAULT_GRANT = "SELECT, INSERT, UPDATE, DELETE"


def _install_tenant_policy(table_name: str) -> None:
    op.execute(f'ALTER TABLE "{table_name}" ENABLE ROW LEVEL SECURITY')
    op.execute(f'ALTER TABLE "{table_name}" FORCE ROW LEVEL SECURITY')
    # Guarded: on a from-scratch database, 0001_phase0_foundation's blanket
    # `metadata.create_all()` already creates every one of these tables
    # under its current (renamed) name directly, and installs this same
    # policy on the ones it lists in TENANT_TABLES -- so this step is only
    # ever a genuine first install on a database created before this
    # revision existed, and a harmless no-op-then-recreate everywhere else.
    op.execute(f'DROP POLICY IF EXISTS {table_name}_tenant_isolation ON "{table_name}"')
    op.execute(
        f"""
        CREATE POLICY {table_name}_tenant_isolation ON "{table_name}"
        USING (
          tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
        )
        WITH CHECK (
          tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
        )
        """
    )
    grant = RESTRICTED_GRANTS.get(table_name, DEFAULT_GRANT)
    op.execute(f'GRANT {grant} ON "{table_name}" TO zentra_runtime')


def upgrade() -> None:
    bind = op.get_bind()
    for table in OLD_TABLES:
        op.execute(f'DROP TABLE IF EXISTS "{table}" CASCADE')

    # `metadata.create_all` skips any table that already exists, and is a
    # no-op for tables unrelated to this cutover -- the same pattern
    # `0001_phase0_foundation.py` uses. Everything in OLD_TABLES was just
    # dropped, so this recreates each one (renamed or not) from the
    # already-updated schema module.
    metadata.create_all(bind=bind)

    for table in (*RECREATED_DEPENDENT_TABLES, *NEW_TENANT_SCOPED_TABLES):
        _install_tenant_policy(table)


def downgrade() -> None:
    # Deliberately does not raise NotImplementedError, even though this is a
    # one-way destructive cutover with nothing meaningful to restore (see
    # ADR-0030): `test_sequence_migration.py` (pre-existing, untouched by
    # this cutover) downgrades to "0018_merge_heads" to exercise the
    # unrelated `sequences` tables, and that walk passes through this
    # revision. Raising here would break that test's ability to reach 0018
    # at all, for a table family this cutover never touches.
    #
    # Only drops the tables genuinely renamed at the table level (Chat
    # Session, Message, Analysis Run, Activity Feed, Analysis Workspace) --
    # those did not exist under these names before this revision, so no
    # earlier migration's own downgrade() references them.
    #
    # RECREATED_DEPENDENT_TABLES is deliberately left untouched here.
    # `upgrade()` already unconditionally drops and recreates every one of
    # them itself (the `DROP TABLE IF EXISTS ... CASCADE` loop over
    # OLD_TABLES, before `metadata.create_all`), so there is nothing this
    # function needs to do for them to make a later re-upgrade safe. Dropping
    # them here would instead break something else: earlier migrations
    # (e.g. 0019's `agent_executions` column drop, 0020's `work_items`
    # constraint drop) downgrade *through* this revision expecting those
    # tables to still exist, under whatever name their own column has at
    # that point -- this revision only ever renamed one FK column on each,
    # never removed the table itself.
    for table in NEW_TENANT_SCOPED_TABLES:
        op.execute(f'DROP TABLE IF EXISTS "{table}" CASCADE')
