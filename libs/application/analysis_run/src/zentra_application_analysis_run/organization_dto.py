from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from uuid import UUID


class OrganizationNotFoundError(LookupError):
    """Raised when an operation needs an Organization that has no binding yet.

    Distinct from `ports.OrganizationPolicyRepository` (per-Organization model
    tier / confidence policy) and `workspace_dto.GroupNotFoundError` (a Group
    inside an already-provisioned Organization) — neither of those names
    collide with this one.
    """


@dataclass(frozen=True, slots=True)
class MembershipDetail:
    organization_id: UUID
    user_id: UUID
    role: str
    created_at: datetime


@dataclass(frozen=True, slots=True)
class OrganizationDetail:
    organization_id: UUID
    name: str
    created_at: datetime
