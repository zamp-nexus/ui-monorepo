"""Link a Sequence to the scoped Investigation Thread that chats about it."""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0020_sequence_thread_link"
down_revision = "0019_sequence_domain"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "sequences",
        sa.Column("thread_id", postgresql.UUID(as_uuid=True), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("sequences", "thread_id")
