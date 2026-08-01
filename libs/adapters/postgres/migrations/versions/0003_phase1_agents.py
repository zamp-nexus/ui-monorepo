"""Register the Phase 1 agents and migrate persisted validation to outcome."""

from alembic import op

revision = "0003_phase1_agents"
down_revision = "0002_phase1a"
branch_labels = None
depends_on = None

# Seeded disabled with a pending eval, because the table's own constraint
# forbids anything else: `enabled = false OR eval_status = 'passing'`.
# `nx run evals:check` is what promotes a row, so an agent cannot reach a
# tenant without its suite having actually run.
AGENTS = (
    ("orchestrator_v1", "orchestrator", "1", "evals/orchestrator"),
    ("sql_analyst_v1", "sql_analyst", "1", "evals/sql_analyst"),
    ("evaluator_v1", "evaluator", "1", "evals/evaluator"),
)


def upgrade() -> None:
    for agent_id, role, version, eval_suite_ref in AGENTS:
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

    # Phase 1A stored a deterministic validation under state->'validation'.
    # The aggregate now carries a discriminated outcome, so reshape in place
    # rather than stranding those investigations.
    # `state` is json, not jsonb, so every operator below needs an explicit cast.
    op.execute(
        """
        UPDATE investigations
        SET state = (
          (state::jsonb - 'validation') || jsonb_build_object(
            'outcome',
            jsonb_build_object('kind', 'validation')
              || (state::jsonb -> 'validation')
          )
        )::json
        WHERE state::jsonb ? 'validation'
          AND state::jsonb -> 'validation' <> 'null'::jsonb
        """
    )
    op.execute(
        """
        UPDATE investigations
        SET state = (
          (state::jsonb - 'validation')
            || jsonb_build_object('outcome', 'null'::jsonb)
        )::json
        WHERE state::jsonb ? 'validation'
        """
    )

    op.execute("GRANT SELECT, INSERT, UPDATE ON agent_registry TO zentra_runtime")


def downgrade() -> None:
    op.execute(
        """
        UPDATE investigations
        SET state = (
          (state::jsonb - 'outcome') || jsonb_build_object(
            'validation', state::jsonb -> 'outcome'
          )
        )::json
        WHERE state::jsonb ? 'outcome'
        """
    )
    agent_ids = ", ".join(f"'{agent_id}'" for agent_id, _, _, _ in AGENTS)
    op.execute(f"DELETE FROM agent_registry WHERE agent_id IN ({agent_ids})")
    op.execute("REVOKE INSERT, UPDATE ON agent_registry FROM zentra_runtime")
