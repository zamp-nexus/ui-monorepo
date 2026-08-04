from __future__ import annotations

import base64
import json
from datetime import UTC, datetime

from svix.webhooks import Webhook

from .test_api import client

SECRET = "whsec_" + base64.b64encode(b"0" * 32).decode()


class OrganizationsStub:
    def __init__(self) -> None:
        self.provision_calls: list[dict[str, object]] = []
        self.add_member_calls: list[dict[str, object]] = []
        self.update_role_calls: list[dict[str, object]] = []
        self.remove_member_calls: list[dict[str, object]] = []

    async def provision_organization(self, **kwargs: object) -> None:
        self.provision_calls.append(kwargs)

    async def add_member(self, **kwargs: object) -> None:
        self.add_member_calls.append(kwargs)

    async def update_member_role(self, **kwargs: object) -> None:
        self.update_role_calls.append(kwargs)

    async def remove_member(self, **kwargs: object) -> None:
        self.remove_member_calls.append(kwargs)


def _signed_headers(body: bytes, *, secret: str = SECRET) -> dict[str, str]:
    msg_id = "msg_test123"
    timestamp = datetime.now(UTC)
    signature = Webhook(secret).sign(msg_id, timestamp, body.decode())
    return {
        "svix-id": msg_id,
        "svix-timestamp": str(int(timestamp.timestamp())),
        "svix-signature": signature,
    }


def _post(test_client, event: dict[str, object], *, secret: str = SECRET):
    body = json.dumps(event).encode()
    headers = _signed_headers(body, secret=secret)
    return test_client.post(
        "/v1/webhooks/clerk",
        content=body,
        headers={**headers, "Content-Type": "application/json"},
    )


def test_invalid_signature_is_rejected() -> None:
    organizations = OrganizationsStub()
    with client(
        organizations=organizations, clerk_webhook_secret=SECRET
    ) as test_client:
        body = json.dumps({"type": "organization.created", "data": {}}).encode()
        response = test_client.post(
            "/v1/webhooks/clerk",
            content=body,
            headers={
                "svix-id": "msg_bad",
                "svix-timestamp": str(int(datetime.now(UTC).timestamp())),
                "svix-signature": "v1," + base64.b64encode(b"not-a-real-signature").decode(),
                "Content-Type": "application/json",
            },
        )

    assert response.status_code == 400
    assert organizations.provision_calls == []


def test_organization_created_provisions_the_organization() -> None:
    organizations = OrganizationsStub()
    with client(
        organizations=organizations, clerk_webhook_secret=SECRET
    ) as test_client:
        response = _post(
            test_client,
            {
                "type": "organization.created",
                "data": {
                    "id": "org_123",
                    "name": "Acme",
                    "slug": "acme",
                    "created_by": "user_abc",
                },
            },
        )

    assert response.status_code == 200
    assert len(organizations.provision_calls) == 1
    call = organizations.provision_calls[0]
    assert call["external_organization_id"] == "org_123"
    assert call["name"] == "Acme"
    assert call["creator_external_user_id"] == "user_abc"
    assert call["creator_email"] is None


def test_membership_created_adds_a_member_with_normalized_role() -> None:
    organizations = OrganizationsStub()
    with client(
        organizations=organizations, clerk_webhook_secret=SECRET
    ) as test_client:
        response = _post(
            test_client,
            {
                "type": "organizationMembership.created",
                "data": {
                    "organization": {"id": "org_123"},
                    "public_user_data": {
                        "user_id": "user_abc",
                        "identifier": "person@example.com",
                    },
                    "role": "org:admin",
                },
            },
        )

    assert response.status_code == 200
    assert len(organizations.add_member_calls) == 1
    call = organizations.add_member_calls[0]
    assert call["external_organization_id"] == "org_123"
    assert call["external_user_id"] == "user_abc"
    assert call["email"] == "person@example.com"
    assert call["role"] == "admin"


def test_membership_updated_updates_the_role() -> None:
    organizations = OrganizationsStub()
    with client(
        organizations=organizations, clerk_webhook_secret=SECRET
    ) as test_client:
        response = _post(
            test_client,
            {
                "type": "organizationMembership.updated",
                "data": {
                    "organization": {"id": "org_123"},
                    "public_user_data": {
                        "user_id": "user_abc",
                        "identifier": "person@example.com",
                    },
                    "role": "org:member",
                },
            },
        )

    assert response.status_code == 200
    assert len(organizations.update_role_calls) == 1
    call = organizations.update_role_calls[0]
    assert call["external_organization_id"] == "org_123"
    assert call["external_user_id"] == "user_abc"
    assert call["role"] == "member"


def test_membership_deleted_removes_the_member() -> None:
    organizations = OrganizationsStub()
    with client(
        organizations=organizations, clerk_webhook_secret=SECRET
    ) as test_client:
        response = _post(
            test_client,
            {
                "type": "organizationMembership.deleted",
                "data": {
                    "organization": {"id": "org_123"},
                    "public_user_data": {
                        "user_id": "user_abc",
                        "identifier": "person@example.com",
                    },
                    "role": "org:member",
                },
            },
        )

    assert response.status_code == 200
    assert len(organizations.remove_member_calls) == 1
    call = organizations.remove_member_calls[0]
    assert call["external_organization_id"] == "org_123"
    assert call["external_user_id"] == "user_abc"


def test_unhandled_event_type_is_a_no_op() -> None:
    organizations = OrganizationsStub()
    with client(
        organizations=organizations, clerk_webhook_secret=SECRET
    ) as test_client:
        response = _post(
            test_client,
            {"type": "session.created", "data": {"id": "sess_1"}},
        )

    assert response.status_code == 200
    assert organizations.provision_calls == []
    assert organizations.add_member_calls == []
    assert organizations.update_role_calls == []
    assert organizations.remove_member_calls == []
