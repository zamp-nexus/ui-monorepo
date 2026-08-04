"""Build the complete ZentraOS control-plane schema from scratch.

The sole migration. The ~30 incremental revisions that preceded it were
collapsed into this one when the Tenant -> Organization rename landed
(ADR-0030: there is no production deployment, so there is no history worth
preserving). Everything those revisions collectively did to a database is
reproduced here in final-state form:

* every table on `zentra_adapter_postgres.schema.metadata`, created in one
  `create_all` pass — the schema module is the single source of truth for
  columns, constraints and indexes, so none of that is restated here;
* Row-Level Security on every Organization-scoped table, isolating rows on
  `app.organization_id`;
* the LangGraph checkpoint tables, which are raw DDL rather than SQLAlchemy
  `Table` objects because LangGraph owns their shape and Alembic only creates
  them so application startup never performs DDL;
* privileges for the `zentra_runtime` role, including the deliberate
  append-only and no-delete carve-outs;
* the Agent Registry seed rows.
"""

from alembic import op

from zentra_adapter_postgres.schema import metadata

revision = "0001_initial_schema"
down_revision = None
branch_labels = None
depends_on = None

#: The role every request-path connection assumes. Created here as well as by
#: `infra/postgres/init/001_runtime_roles.sql`, because a database that was
#: not provisioned from that init script still needs the grants below to have
#: somewhere to land.
RUNTIME_ROLE = "zentra_runtime"

#: Organization-scoped, but deliberately not row-isolated: a binding is how a
#: request *discovers* which Organization an external identity resolves to, so
#: it has to be readable before `app.organization_id` is set.
UNISOLATED_ORGANIZATION_TABLES = frozenset({"organization_identity_bindings"})

#: Not Organization-scoped at all, so RLS has nothing to key on. Read by every
#: Organization; written only through the paths granted below.
GLOBAL_TABLES = ("users", "identity_subjects", "agent_registry")

#: Every Organization-scoped table defaults to full CRUD. These do not.
#: Messages and Activity Feed events are immutable logs, and Visualization
#: Briefs and Artifacts are appended to and refined but never deleted.
RESTRICTED_GRANTS = {
    "messages": "SELECT, INSERT",
    "activity_events": "SELECT, INSERT",
    "visualization_briefs": "SELECT, INSERT, UPDATE",
    "visualization_artifacts": "SELECT, INSERT, UPDATE",
}
DEFAULT_GRANT = "SELECT, INSERT, UPDATE, DELETE"

#: LangGraph's own checkpoint tables. `organization_id` is generated from the
#: thread identifier, which is always `<organization UUID>:<analysis run
#: UUID>`, so RLS can isolate rows LangGraph writes without LangGraph knowing
#: RLS exists.
CHECKPOINT_ORGANIZATION_ID = (
    "organization_id UUID GENERATED ALWAYS AS "
    "(split_part(thread_id, ':', 1)::uuid) STORED"
)
CHECKPOINT_TABLES = ("checkpoints", "checkpoint_blobs", "checkpoint_writes")

#: Seeded disabled with a pending eval, because
#: `ck_agent_registry_enabled_requires_passing_eval` forbids anything else:
#: `nx run evals:promote` is what promotes a row, so an Agent cannot reach an
#: Organization without its suite having actually run.
PENDING_AGENTS = (
    ("orchestrator_v1", "orchestrator", "1", "evals/orchestrator"),
    ("cube_analyst_v1", "cube_analyst", "1", "evals/cube_analyst"),
    ("evaluator_v1", "evaluator", "1", "evals/evaluator"),
    ("insight_v1", "insight", "1", "evals/insight"),
)


def _organization_scoped_tables() -> tuple[str, ...]:
    """Every table RLS applies to, derived rather than listed.

    A hand-kept list is exactly the kind of thing that silently leaves a new
    table unprotected. Carrying `organization_id` is what makes a table
    isolatable, so that is the test.
    """
    return tuple(
        sorted(
            table.name
            for table in metadata.tables.values()
            if "organization_id" in table.c
            and table.name not in UNISOLATED_ORGANIZATION_TABLES
        )
    )


def _install_organization_policy(table_name: str) -> None:
    op.execute(f'ALTER TABLE "{table_name}" ENABLE ROW LEVEL SECURITY')
    op.execute(f'ALTER TABLE "{table_name}" FORCE ROW LEVEL SECURITY')
    op.execute(
        f"""
        CREATE POLICY {table_name}_organization_isolation ON "{table_name}"
        USING (
          organization_id =
            NULLIF(current_setting('app.organization_id', true), '')::uuid
        )
        WITH CHECK (
          organization_id =
            NULLIF(current_setting('app.organization_id', true), '')::uuid
        )
        """
    )


def _create_runtime_role() -> None:
    op.execute(
        f"""
        DO $$
        BEGIN
          IF NOT EXISTS (
            SELECT 1 FROM pg_roles WHERE rolname = '{RUNTIME_ROLE}'
          ) THEN
            CREATE ROLE {RUNTIME_ROLE} NOLOGIN NOSUPERUSER NOBYPASSRLS;
          END IF;
        END
        $$;
        """
    )


def _create_checkpoint_tables() -> None:
    op.execute(
        "CREATE TABLE IF NOT EXISTS checkpoint_migrations (v INTEGER PRIMARY KEY)"
    )
    op.execute(
        f"""
        CREATE TABLE IF NOT EXISTS checkpoints (
          thread_id TEXT NOT NULL,
          {CHECKPOINT_ORGANIZATION_ID},
          checkpoint_ns TEXT NOT NULL DEFAULT '',
          checkpoint_id TEXT NOT NULL,
          parent_checkpoint_id TEXT,
          type TEXT,
          checkpoint JSONB NOT NULL,
          metadata JSONB NOT NULL DEFAULT '{{}}',
          PRIMARY KEY (thread_id, checkpoint_ns, checkpoint_id)
        )
        """
    )
    op.execute(
        f"""
        CREATE TABLE IF NOT EXISTS checkpoint_blobs (
          thread_id TEXT NOT NULL,
          {CHECKPOINT_ORGANIZATION_ID},
          checkpoint_ns TEXT NOT NULL DEFAULT '',
          channel TEXT NOT NULL,
          version TEXT NOT NULL,
          type TEXT NOT NULL,
          blob BYTEA,
          PRIMARY KEY (thread_id, checkpoint_ns, channel, version)
        )
        """
    )
    op.execute(
        f"""
        CREATE TABLE IF NOT EXISTS checkpoint_writes (
          thread_id TEXT NOT NULL,
          {CHECKPOINT_ORGANIZATION_ID},
          checkpoint_ns TEXT NOT NULL DEFAULT '',
          checkpoint_id TEXT NOT NULL,
          task_id TEXT NOT NULL,
          idx INTEGER NOT NULL,
          channel TEXT NOT NULL,
          type TEXT,
          blob BYTEA NOT NULL,
          task_path TEXT NOT NULL DEFAULT '',
          PRIMARY KEY (thread_id, checkpoint_ns, checkpoint_id, task_id, idx)
        )
        """
    )
    for table_name in CHECKPOINT_TABLES:
        op.execute(
            f"CREATE INDEX IF NOT EXISTS {table_name}_thread_id_idx "
            f"ON {table_name}(thread_id)"
        )
    op.execute(
        "INSERT INTO checkpoint_migrations(v) SELECT generate_series(0, 9) "
        "ON CONFLICT DO NOTHING"
    )


def _seed_agent_registry() -> None:
    for agent_id, role, version, eval_suite_ref in PENDING_AGENTS:
        op.execute(
            f"""
            INSERT INTO agent_registry
              (agent_id, role, version, enabled, eval_status, eval_suite_ref)
            VALUES
              ('{agent_id}', '{role}', '{version}', false, 'pending',
               '{eval_suite_ref}')
            ON CONFLICT (agent_id) DO NOTHING
            """
        )
    # The one Agent seeded enabled: it renders an already-governed brief and
    # its suite passes, so there is nothing for a promotion step to gate.
    op.execute(
        """
        INSERT INTO agent_registry(
          agent_id, role, version, enabled, eval_status, eval_suite_ref,
          display_name, description, capabilities
        ) VALUES (
          'data_visualization_v1', 'visualization', '1.0', true, 'passing',
          'evals://data-visualization/v1', 'Data Visualization Agent',
          'Turns a published, cited Visualization Brief into presentation-only UI.',
          json_build_array(json_build_object(
            'capability_id', 'render_published_finding',
            'version', '1.0',
            'display_name', 'Render published finding',
            'description',
            'Creates presentation UI from an immutable governed brief.'
          ))
        )
        ON CONFLICT (agent_id) DO NOTHING
        """
    )


def _grant_runtime_privileges(organization_tables: tuple[str, ...]) -> None:
    op.execute(f"GRANT USAGE ON SCHEMA public TO {RUNTIME_ROLE}")

    # Global tables: readable by every Organization.
    global_list = ", ".join(GLOBAL_TABLES)
    op.execute(f"GRANT SELECT ON {global_list} TO {RUNTIME_ROLE}")
    # The registry's eval status is written by the promotion path, which runs
    # as the runtime role.
    op.execute(f"GRANT INSERT, UPDATE ON agent_registry TO {RUNTIME_ROLE}")

    # Identity provisioning: first sign-in creates a User, its identity
    # subject, and the Organization binding. Deliberately no DELETE —
    # unbinding an identity is an operator action, not a request-path one.
    op.execute(
        "GRANT SELECT, INSERT, UPDATE ON users, identity_subjects, "
        f"organization_identity_bindings TO {RUNTIME_ROLE}"
    )

    for table_name in organization_tables:
        grant = RESTRICTED_GRANTS.get(table_name, DEFAULT_GRANT)
        op.execute(f'GRANT {grant} ON "{table_name}" TO {RUNTIME_ROLE}')

    for table_name in CHECKPOINT_TABLES:
        op.execute(f"GRANT {DEFAULT_GRANT} ON {table_name} TO {RUNTIME_ROLE}")


def upgrade() -> None:
    bind = op.get_bind()
    organization_tables = _organization_scoped_tables()

    _create_runtime_role()
    metadata.create_all(bind=bind)
    _create_checkpoint_tables()

    for table_name in (*organization_tables, *CHECKPOINT_TABLES):
        _install_organization_policy(table_name)

    _grant_runtime_privileges(organization_tables)
    _seed_agent_registry()


def downgrade() -> None:
    # Nothing to walk back to: this is the first revision. Enough to leave a
    # database this migration built empty again.
    for table_name in reversed(CHECKPOINT_TABLES):
        op.execute(f"DROP TABLE IF EXISTS {table_name} CASCADE")
    op.execute("DROP TABLE IF EXISTS checkpoint_migrations CASCADE")
    metadata.drop_all(bind=op.get_bind())
