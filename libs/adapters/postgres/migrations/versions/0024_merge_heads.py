"""Merge the two parallel migration heads before this branch's own head.

`0020_sequence_thread_link` (Sequence Phase 4, landed on `main` concurrently)
and `0023_chat_analysis_run_cutover` (this branch's Chat & Analysis Run
cutover) both descend from `0019_sequence_domain` but never converged,
leaving two heads. `upgrade head` is ambiguous against two heads. This is a
pure Alembic merge point: no schema change, just one lineage going forward
-- same pattern as `0018_merge_heads.py` and `0022_merge_heads.py`.
"""

revision = "0024_merge_heads"
down_revision = ("0020_sequence_thread_link", "0023_chat_analysis_run_cutover")
branch_labels = None
depends_on = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
