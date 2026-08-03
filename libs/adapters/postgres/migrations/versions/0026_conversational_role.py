"""Accept the new `conversational` canonical role (ADR-0033).

Mirrors `0021_intake_role.py`'s expand step: role vocabularies are enforced
by a `CHECK` derived from the current role list at the time each table was
created, so a new role needs its own migration widening that `CHECK` rather
than a rewrite of the migration that first installed it.
"""

from alembic import op

revision = "0026_conversational_role"
down_revision = "0025_chat_session_dataset_default"
branch_labels = None
depends_on = None

_PRIOR_ROLES = (
    "orchestrator",
    "data_intake",
    "data_quality",
    "data_preparation",
    "semantic_modeling",
    "cube_analyst",
    "evaluator",
    "statistician",
    "insight",
    "demand_planner",
    "forecaster",
    "visualization",
    "executive_report_writer",
    "knowledge",
    "intake",
)
_ROLES_WITH_CONVERSATIONAL = _PRIOR_ROLES + ("conversational",)


def _role_check(roles: tuple[str, ...]) -> str:
    values = ", ".join(f"'{role}'" for role in roles)
    return f"role IN ({values})"


def upgrade() -> None:
    op.execute(
        "ALTER TABLE agent_registry DROP CONSTRAINT IF EXISTS ck_agent_registry_role"
    )
    op.execute(
        "ALTER TABLE agent_registry ADD CONSTRAINT ck_agent_registry_role "
        f"CHECK ({_role_check(_ROLES_WITH_CONVERSATIONAL)}) NOT VALID"
    )
    op.execute("ALTER TABLE work_items DROP CONSTRAINT IF EXISTS ck_work_items_role")
    op.execute(
        "ALTER TABLE work_items ADD CONSTRAINT ck_work_items_role "
        f"CHECK ({_role_check(_ROLES_WITH_CONVERSATIONAL)}) NOT VALID"
    )


def downgrade() -> None:
    op.execute(
        "ALTER TABLE agent_registry DROP CONSTRAINT IF EXISTS ck_agent_registry_role"
    )
    op.execute(
        "ALTER TABLE agent_registry ADD CONSTRAINT ck_agent_registry_role "
        f"CHECK ({_role_check(_PRIOR_ROLES)}) NOT VALID"
    )
    op.execute("ALTER TABLE work_items DROP CONSTRAINT IF EXISTS ck_work_items_role")
    op.execute(
        "ALTER TABLE work_items ADD CONSTRAINT ck_work_items_role "
        f"CHECK ({_role_check(_PRIOR_ROLES)}) NOT VALID"
    )
