from __future__ import annotations

import unicodedata
from dataclasses import dataclass
from datetime import datetime
from uuid import UUID

MAX_GROUP_NAME_LENGTH = 100


class GroupNameError(ValueError):
    """A Group or Project name cannot be stored safely."""


def normalize_group_name(value: str) -> tuple[str, str]:
    """Return the display name and its parent-scoped uniqueness key."""
    normalized = unicodedata.normalize("NFKC", value)
    if any(unicodedata.category(character).startswith("C") for character in normalized):
        raise GroupNameError(
            "Group and Project names cannot contain control characters"
        )
    display_name = " ".join(normalized.split())
    if not display_name:
        raise GroupNameError("Group and Project names cannot be empty")
    if len(display_name) > MAX_GROUP_NAME_LENGTH:
        raise GroupNameError(
            "Group and Project names cannot exceed "
            f"{MAX_GROUP_NAME_LENGTH} characters"
        )
    return display_name, display_name.casefold()


@dataclass(slots=True)
class Group:
    group_id: UUID
    organization_id: UUID
    name: str
    normalized_name: str
    created_at: datetime
    updated_at: datetime
    archived_at: datetime | None = None

    @classmethod
    def create(
        cls,
        *,
        group_id: UUID,
        organization_id: UUID,
        name: str,
        now: datetime,
    ) -> Group:
        display_name, normalized_name = normalize_group_name(name)
        return cls(
            group_id=group_id,
            organization_id=organization_id,
            name=display_name,
            normalized_name=normalized_name,
            created_at=now,
            updated_at=now,
        )

    def rename(self, name: str, now: datetime) -> None:
        self.name, self.normalized_name = normalize_group_name(name)
        self.updated_at = now

    def archive(self, now: datetime) -> None:
        if self.archived_at is None:
            self.archived_at = now
            self.updated_at = now

    def restore(self, now: datetime) -> None:
        if self.archived_at is not None:
            self.archived_at = None
            self.updated_at = now


@dataclass(slots=True)
class Project:
    project_id: UUID
    organization_id: UUID
    group_id: UUID
    name: str
    normalized_name: str
    created_at: datetime
    updated_at: datetime
    latest_activity_at: datetime
    archived_at: datetime | None = None

    @classmethod
    def create(
        cls,
        *,
        project_id: UUID,
        organization_id: UUID,
        group_id: UUID,
        name: str,
        now: datetime,
    ) -> Project:
        display_name, normalized_name = normalize_group_name(name)
        return cls(
            project_id=project_id,
            organization_id=organization_id,
            group_id=group_id,
            name=display_name,
            normalized_name=normalized_name,
            created_at=now,
            updated_at=now,
            latest_activity_at=now,
        )

    def rename(self, name: str, now: datetime) -> None:
        self.name, self.normalized_name = normalize_group_name(name)
        self.updated_at = now

    def archive(self, now: datetime) -> None:
        if self.archived_at is None:
            self.archived_at = now
            self.updated_at = now

    def restore(self, now: datetime) -> None:
        if self.archived_at is not None:
            self.archived_at = None
            self.updated_at = now

    def record_activity(self, now: datetime) -> None:
        if now > self.latest_activity_at:
            self.latest_activity_at = now
