from sqlalchemy import (
    TIMESTAMP,
    CheckConstraint,
    Column,
    ForeignKey,
    ForeignKeyConstraint,
    Index,
    Integer,
    String,
    Table,
    UniqueConstraint,
    text,
)
from sqlalchemy.dialects.postgresql import UUID

from ._metadata import metadata

execution_jobs = Table(
    "execution_jobs",
    metadata,
    Column(
        "job_id",
        UUID(as_uuid=True),
        primary_key=True,
        server_default=text("gen_random_uuid()"),
    ),
    Column(
        "tenant_id",
        UUID(as_uuid=True),
        ForeignKey("tenants.tenant_id", ondelete="CASCADE"),
        nullable=False,
    ),
    Column("investigation_id", UUID(as_uuid=True), nullable=False),
    Column("status", String(16), nullable=False, server_default="queued"),
    Column("attempts", Integer, nullable=False, server_default="0"),
    Column("max_attempts", Integer, nullable=False, server_default="3"),
    Column(
        "available_at",
        TIMESTAMP(timezone=True),
        nullable=False,
        server_default=text("now()"),
    ),
    Column("lease_owner", String(128)),
    Column("lease_expires_at", TIMESTAMP(timezone=True)),
    Column("failure_category", String(64)),
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
    Column("completed_at", TIMESTAMP(timezone=True)),
    ForeignKeyConstraint(
        ("investigation_id", "tenant_id"),
        ("investigations.investigation_id", "investigations.tenant_id"),
        name="fk_execution_jobs_investigation_tenant",
        ondelete="CASCADE",
    ),
    UniqueConstraint(
        "tenant_id",
        "investigation_id",
        name="uq_execution_jobs_investigation",
    ),
    CheckConstraint(
        "status IN ('queued', 'leased', 'completed', 'failed', 'cancelled')",
        name="ck_execution_jobs_status",
    ),
    CheckConstraint(
        "attempts >= 0 AND attempts <= max_attempts AND max_attempts >= 1",
        name="ck_execution_jobs_attempts",
    ),
    CheckConstraint(
        "(status = 'leased' AND lease_owner IS NOT NULL AND "
        "lease_expires_at IS NOT NULL) OR "
        "(status <> 'leased' AND lease_owner IS NULL AND lease_expires_at IS NULL)",
        name="ck_execution_jobs_lease",
    ),
)
Index(
    "ix_execution_jobs_claim",
    execution_jobs.c.tenant_id,
    execution_jobs.c.status,
    execution_jobs.c.available_at,
    execution_jobs.c.created_at,
)
