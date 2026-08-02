"""Add the public Work Feed, linked attempts, usage, and visualization state.

The parts of this migration that touched `investigation_threads`,
`investigations`' thread-lineage columns, `thread_events`, the
`visualization_*` tables, and `execution_jobs`' investigation-linked columns
and constraints are neutralized: the Chat & Analysis Run cutover (0023,
chat_analysis_run_cutover) drops and recreates every one of those tables
from their final renamed shape, so replaying the original steps here would
either import symbols that no longer exist or create structure 0023
immediately drops (ADR-0028, ADR-0030). The unrelated column additions to
`agent_executions`/`agent_registry` and the Data Visualization Agent seed
row are real, load-bearing changes and are kept.
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy import inspect

revision = "0017_chat_work_feed_visualization"
down_revision = "0016c_widen_alembic_version_num"
branch_labels = None
depends_on = None


def _column(table: str, column: sa.Column) -> None:
    columns = {value["name"] for value in inspect(op.get_bind()).get_columns(table)}
    if column.name not in columns:
        op.add_column(table, column)


def upgrade() -> None:
    for _name, column in (
        ("role", sa.Column("role", sa.String(64))),
        ("provider", sa.Column("provider", sa.String(64))),
        (
            "input_tokens",
            sa.Column("input_tokens", sa.Integer(), nullable=False, server_default="0"),
        ),
        (
            "output_tokens",
            sa.Column(
                "output_tokens", sa.Integer(), nullable=False, server_default="0"
            ),
        ),
        (
            "fallbacks",
            sa.Column(
                "fallbacks", sa.JSON(), nullable=False, server_default=sa.text("'[]'")
            ),
        ),
    ):
        _column("agent_executions", column)

    for column in (
        sa.Column("display_name", sa.Text()),
        sa.Column("description", sa.Text()),
        sa.Column(
            "capabilities", sa.JSON(), nullable=False, server_default=sa.text("'[]'")
        ),
    ):
        _column("agent_registry", column)

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
        ON CONFLICT (agent_id) DO UPDATE SET
          version = EXCLUDED.version,
          enabled = EXCLUDED.enabled,
          eval_status = EXCLUDED.eval_status,
          eval_suite_ref = EXCLUDED.eval_suite_ref,
          display_name = EXCLUDED.display_name,
          description = EXCLUDED.description,
          capabilities = EXCLUDED.capabilities
        """
    )


def downgrade() -> None:
    for column in ("capabilities", "description", "display_name"):
        op.drop_column("agent_registry", column)
    for column in ("fallbacks", "output_tokens", "input_tokens", "provider", "role"):
        op.drop_column("agent_executions", column)
