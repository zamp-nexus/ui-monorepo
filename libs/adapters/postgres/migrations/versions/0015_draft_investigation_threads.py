"""Add Draft Investigation Threads and immutable messages.

Neutralized by the Chat & Analysis Run cutover (0023,
chat_analysis_run_cutover): `investigation_threads`/`thread_messages` are
renamed to `chat_sessions`/`messages` there, and `investigations` (renamed
`analysis_runs`) is dropped and recreated from its final shape in the same
migration -- including the thread-link columns and constraints this
migration used to add incrementally. Replaying this step would either
import symbols that no longer exist, or create tables/constraints 0023
immediately drops. There is no production deployment with data depending
on this exact incremental history (ADR-0030), so this migration is a no-op
kept only for its position in the revision chain.
"""

from alembic import op

revision = "0015_draft_investigation_threads"
down_revision = "0014_workspace_groups_projects"
branch_labels = None
depends_on = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
