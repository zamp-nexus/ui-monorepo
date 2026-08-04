from __future__ import annotations

from datetime import UTC, datetime
from uuid import UUID

from zentra_adapter_postgres import IdentityContext
from zentra_application_analysis_run import (
    GroupDetail,
    GroupPage,
    PermissionDeniedError,
)

from .test_api import client

AUTH = {"Authorization": "Bearer valid"}
NOW = datetime(2026, 8, 1, tzinfo=UTC)
GROUP_ID = UUID("41000000-0000-0000-0000-000000000001")


class WorkspaceStub:
    def __init__(self) -> None:
        self.last_name: str | None = None
        self.group = GroupDetail(
            group_id=GROUP_ID,
            name="Finance",
            created_at=NOW,
            updated_at=NOW,
            archived_at=None,
            can_manage=True,
        )

    async def create_group(self, *args: object, name: str) -> GroupDetail:
        self.last_name = name
        return self.group

    async def list_groups(self, *args: object, **kwargs: object) -> GroupPage:
        return GroupPage(items=(self.group,), next_cursor="next")

    async def get_group(self, *args: object, **kwargs: object) -> GroupDetail:
        return self.group

    async def rename_group(
        self, *args: object, name: str, **kwargs: object
    ) -> GroupDetail:
        self.last_name = name
        return self.group

    async def archive_group(self, *args: object, **kwargs: object) -> GroupDetail:
        return self.group

    async def restore_group(self, *args: object, **kwargs: object) -> GroupDetail:
        return self.group


def bind_identity(monkeypatch, *, role: str = "owner") -> None:
    async def resolve(*args: object, **kwargs: object) -> IdentityContext:
        return IdentityContext(
            user_id=UUID("10000000-0000-0000-0000-000000000001"),
            organization_id=UUID("20000000-0000-0000-0000-000000000002"),
            email="owner@example.com",
            organization_name="Acme",
            role=role,
        )

    monkeypatch.setattr("zentra_api.request_context.resolve_identity_context", resolve)


def test_owner_creates_and_lists_groups(monkeypatch) -> None:
    bind_identity(monkeypatch)
    workspace = WorkspaceStub()

    with client(groups=workspace) as test_client:
        created = test_client.post("/v1/groups", headers=AUTH, json={"name": "Finance"})
        listed = test_client.get("/v1/groups", headers=AUTH)

    assert created.status_code == 201
    assert created.json()["group_id"] == str(GROUP_ID)
    assert created.json()["can_manage"] is True
    assert listed.json() == {
        "items": [created.json()],
        "next_cursor": "next",
    }


def test_workspace_permission_errors_have_stable_codes(monkeypatch) -> None:
    bind_identity(monkeypatch, role="member")

    class RefusingWorkspace(WorkspaceStub):
        async def create_group(self, *args: object, name: str) -> GroupDetail:
            raise PermissionDeniedError("This membership cannot organize workspaces")

    with client(groups=RefusingWorkspace()) as test_client:
        response = test_client.post(
            "/v1/groups", headers=AUTH, json={"name": "Finance"}
        )

    assert response.status_code == 403
    assert response.json()["detail"]["code"] == "permission_denied"


def test_openapi_exposes_every_group_operation() -> None:
    with client(groups=WorkspaceStub()) as test_client:
        paths = set(test_client.get("/openapi.json").json()["paths"])

    assert {
        "/v1/groups",
        "/v1/groups/{group_id}",
        "/v1/groups/{group_id}/archive",
        "/v1/groups/{group_id}/restore",
    } <= paths
    assert "/v1/groups/{group_id}/projects" not in paths
