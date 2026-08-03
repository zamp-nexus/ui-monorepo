"""Link a Sequence to the scoped Investigation Thread that chats about it."""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql
from sqlalchemy import inspect

revision = "0020_sequence_thread_link"
down_revision = "0019_sequence_domain"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Guarded rather than unconditional: on a from-scratch database,
    # `0001_phase0_foundation`'s blanket `metadata.create_all()` already
    # creates `sequences` with every column the schema module currently
    # defines, `thread_id` included -- only reachable (and only visible as a
    # bug) once something actually exercises a genuinely fresh install.
    existing = {
        column["name"] for column in inspect(op.get_bind()).get_columns("sequences")
    }
    if "thread_id" not in existing:
        op.add_column(
            "sequences",
            sa.Column("thread_id", postgresql.UUID(as_uuid=True), nullable=True),
        )


def downgrade() -> None:
    op.drop_column("sequences", "thread_id")
