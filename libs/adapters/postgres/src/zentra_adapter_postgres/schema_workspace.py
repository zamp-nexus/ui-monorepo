from sqlalchemy import (
    TIMESTAMP,
    CheckConstraint,
    Column,
    ForeignKey,
    Index,
    Table,
    Text,
    UniqueConstraint,
    text,
)
from sqlalchemy.dialects.postgresql import UUID

from ._metadata import metadata

workspace_groups = Table(
    "workspace_groups",
    metadata,
    Column(
        "group_id",
        UUID(as_uuid=True),
        primary_key=True,
        server_default=text("gen_random_uuid()"),
    ),
    Column(
        "organization_id",
        UUID(as_uuid=True),
        ForeignKey("organizations.organization_id", ondelete="CASCADE"),
        nullable=False,
    ),
    Column("name", Text, nullable=False),
    Column("normalized_name", Text, nullable=False),
    Column(
        "created_at",
        TIMESTAMP(timezone=True),
        nullable=False,
        server_default=text("now()"),
    ),
    Column(
        "updated_at",
        TIMESTAMP(timezone=True),
        nullable=False,
        server_default=text("now()"),
    ),
    Column("archived_at", TIMESTAMP(timezone=True)),
    UniqueConstraint(
        "organization_id",
        "normalized_name",
        name="uq_workspace_groups_organization_name",
    ),
    UniqueConstraint(
        "group_id",
        "organization_id",
        name="uq_workspace_groups_organization_identity",
    ),
    CheckConstraint(
        "char_length(name) BETWEEN 1 AND 100",
        name="ck_workspace_groups_name_length",
    ),
)
Index(
    "ix_workspace_groups_organization_activity",
    workspace_groups.c.organization_id,
    workspace_groups.c.updated_at.desc(),
    workspace_groups.c.group_id.desc(),
)
