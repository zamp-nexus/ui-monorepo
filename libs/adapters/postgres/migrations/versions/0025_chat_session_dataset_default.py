"""Add chat_sessions.default_data_connection_id (ADR-0032's #dataset command).

Guarded rather than unconditional: on a from-scratch database,
`0001_phase0_foundation`'s blanket `metadata.create_all()` already creates
`chat_sessions` with every column the schema module currently defines,
`default_data_connection_id` included.
"""

from alembic import op
from sqlalchemy import Column, ForeignKey, inspect
from sqlalchemy.dialects.postgresql import UUID

revision = "0025_chat_session_dataset_default"
down_revision = "0024_merge_heads"
branch_labels = None
depends_on = None


def upgrade() -> None:
    existing = {
        column["name"]
        for column in inspect(op.get_bind()).get_columns("chat_sessions")
    }
    if "default_data_connection_id" not in existing:
        op.add_column(
            "chat_sessions",
            Column(
                "default_data_connection_id",
                UUID(as_uuid=True),
                ForeignKey("data_sources.data_source_id", ondelete="SET NULL"),
            ),
        )


def downgrade() -> None:
    op.drop_column("chat_sessions", "default_data_connection_id")
