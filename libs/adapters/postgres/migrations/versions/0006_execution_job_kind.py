"""Migrate legacy investigation jobs to analysis-run jobs."""

from alembic import op


revision = "0006_execution_job_kind"
down_revision = "0005_workflow_routing_profiles"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.drop_constraint("ck_execution_jobs_kind", "execution_jobs", type_="check")
    op.drop_constraint("ck_execution_jobs_target", "execution_jobs", type_="check")
    op.execute(
        "UPDATE execution_jobs SET job_kind = 'analysis_run' "
        "WHERE job_kind IN ('analysis', 'investigation')"
    )
    op.create_check_constraint(
        "ck_execution_jobs_kind",
        "execution_jobs",
        "job_kind IN ('analysis_run', 'visualization')",
    )
    op.create_check_constraint(
        "ck_execution_jobs_target",
        "execution_jobs",
        "(job_kind = 'analysis_run' AND visualization_id IS NULL) OR "
        "(job_kind = 'visualization' AND visualization_id IS NOT NULL)",
    )


def downgrade() -> None:
    op.drop_constraint("ck_execution_jobs_kind", "execution_jobs", type_="check")
    op.drop_constraint("ck_execution_jobs_target", "execution_jobs", type_="check")
    op.execute(
        "UPDATE execution_jobs SET job_kind = 'investigation' "
        "WHERE job_kind = 'analysis_run'"
    )
    op.create_check_constraint(
        "ck_execution_jobs_kind",
        "execution_jobs",
        "job_kind IN ('investigation', 'visualization')",
    )
    op.create_check_constraint(
        "ck_execution_jobs_target",
        "execution_jobs",
        "(job_kind = 'investigation' AND visualization_id IS NULL) OR "
        "(job_kind = 'visualization' AND visualization_id IS NOT NULL)",
    )
