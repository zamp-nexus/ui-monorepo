from __future__ import annotations

import binascii
import logging
from typing import Any
from uuid import uuid4

from fastapi import APIRouter, Header, Request, status
from fastapi.responses import JSONResponse
from svix.webhooks import Webhook, WebhookVerificationError

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/v1")

#: Clerk's `org:admin` / `org:member` role strings, mapped onto the values
#: `organization_memberships.role`'s CHECK constraint actually allows
#: (`'owner', 'admin', 'member', 'viewer'` -- see
#: `ck_organization_memberships_role` in
#: `zentra_adapter_postgres.schema`). Clerk has no third organization role,
#: so there is nothing to map to `'viewer'`; an unrecognized string falls
#: back to `'member'` -- this codebase's least-privileged valid role --
#: rather than the `'guest'` this schema does not have.
_CLERK_ROLE_MAP = {
    "org:admin": "admin",
    "org:member": "member",
}


def normalize_clerk_role(clerk_role: str) -> str:
    return _CLERK_ROLE_MAP.get(clerk_role, "member")


def _verify(secret: str, payload: bytes, headers: dict[str, str]) -> dict[str, Any]:
    return Webhook(secret).verify(payload, headers)  # type: ignore[no-any-return]


@router.post("/webhooks/clerk", include_in_schema=False)
async def clerk_webhook(
    request: Request,
    svix_id: str = Header(...),
    svix_timestamp: str = Header(...),
    svix_signature: str = Header(...),
) -> JSONResponse:
    """Not behind `authenticated_context`: Clerk sends no bearer token here,
    only Svix signature headers, so this route verifies those itself.

    The raw bytes are read (not FastAPI's parsed-body injection) because
    Svix verifies over the exact bytes Clerk signed -- reparsing and
    re-serializing the JSON would not reproduce them.
    """
    settings = request.app.state.settings
    if not settings.clerk_webhook_secret:
        logger.warning("Rejected Clerk webhook: CLERK_WEBHOOK_SECRET is not configured")
        return JSONResponse(
            status_code=status.HTTP_400_BAD_REQUEST,
            content={"detail": "Webhook signing secret is not configured"},
        )

    payload = await request.body()
    try:
        event = _verify(
            settings.clerk_webhook_secret,
            payload,
            {
                "svix-id": svix_id,
                "svix-timestamp": svix_timestamp,
                "svix-signature": svix_signature,
            },
        )
    except (WebhookVerificationError, binascii.Error, ValueError) as error:
        # `svix-signature`/`svix-id` are attacker-controlled request headers.
        # A malformed (not just wrong) value can raise before Svix even gets
        # to the signature comparison -- e.g. `binascii.Error` unbase64-ing a
        # truncated `svix-signature`, or `ValueError` parsing `svix-timestamp`
        # -- and those must 400 the same as a genuinely bad signature, not
        # 500.
        logger.warning("Rejected Clerk webhook: invalid signature: %s", error)
        return JSONResponse(
            status_code=status.HTTP_400_BAD_REQUEST,
            content={"detail": "Invalid webhook signature"},
        )

    event_type = event.get("type")
    data = event.get("data") or {}
    organizations = request.app.state.dependencies.organizations
    trace_id, span_id = uuid4(), uuid4()

    if event_type == "organization.created":
        await organizations.provision_organization(
            trace_id=trace_id,
            span_id=span_id,
            external_organization_id=data["id"],
            name=data["name"],
            creator_external_user_id=data.get("created_by"),
            # No creator email is present on this event. Clerk fires
            # `organizationMembership.created` for the same creator right
            # after, and that event's `add_member` call upserts the real
            # email -- `provision_organization`'s creator fields are
            # optional for exactly this reason.
            creator_email=None,
        )
    elif event_type == "organizationMembership.created":
        public_user_data = data["public_user_data"]
        await organizations.add_member(
            trace_id=trace_id,
            span_id=span_id,
            external_organization_id=data["organization"]["id"],
            external_user_id=public_user_data["user_id"],
            email=public_user_data["identifier"],
            role=normalize_clerk_role(data["role"]),
        )
    elif event_type == "organizationMembership.updated":
        await organizations.update_member_role(
            trace_id=trace_id,
            span_id=span_id,
            external_organization_id=data["organization"]["id"],
            external_user_id=data["public_user_data"]["user_id"],
            role=normalize_clerk_role(data["role"]),
        )
    elif event_type == "organizationMembership.deleted":
        await organizations.remove_member(
            trace_id=trace_id,
            span_id=span_id,
            external_organization_id=data["organization"]["id"],
            external_user_id=data["public_user_data"]["user_id"],
        )
    else:
        # An event this handler has no dispatch for. 200, never an error --
        # an error tells Clerk/Svix to retry an event nothing here can act on.
        return JSONResponse(status_code=status.HTTP_200_OK, content={"status": "ignored"})

    return JSONResponse(status_code=status.HTTP_200_OK, content={"status": "ok"})
