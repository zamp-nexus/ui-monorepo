"""Add the per-tenant model tier that selects a provider chain."""

import sqlalchemy as sa
from alembic import op

revision = "0004_model_tier"
down_revision = "0003_phase1_agents"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Defaults to free: a tenant only reaches Anthropic-first routing, and the
    # no-training guarantee that comes with it, by being put on premium
    # deliberately.
    op.add_column(
        "tenants",
        sa.Column(
            "model_tier",
            sa.String(16),
            nullable=False,
            server_default="free",
        ),
    )
    op.create_check_constraint(
        "ck_tenants_model_tier",
        "tenants",
        "model_tier IN ('free', 'premium')",
    )


def downgrade() -> None:
    op.execute("ALTER TABLE tenants DROP CONSTRAINT IF EXISTS ck_tenants_model_tier")
    op.drop_column("tenants", "model_tier")
