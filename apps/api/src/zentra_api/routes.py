from __future__ import annotations

import asyncio
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Header, HTTPException, Request, status
from fastapi.responses import JSONResponse
from pydantic import BaseModel, ConfigDict
from zentra_adapter_postgres import IdentityNotBoundError, resolve_identity_context
from zentra_adapter_telemetry import correlate_tenant

from .auth import AuthenticationError, bearer_token

router = APIRouter()


class DependencyStatus(BaseModel):
    model_config = ConfigDict(extra="forbid")

    status: str


class ReadinessResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    status: str
    dependencies: dict[str, DependencyStatus]
    configuration: dict[str, bool]


class ContextResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    user_id: UUID
    tenant_id: UUID
    email: str
    tenant_name: str
    role: str


@router.get("/health/live")
async def live() -> dict[str, str]:
    return {"status": "live"}


@router.get("/health/ready", response_model=ReadinessResponse)
async def ready(request: Request) -> JSONResponse:
    dependencies = request.app.state.dependencies
    checks = await asyncio.gather(
        dependencies.database.health(),
        dependencies.audit.health(),
        dependencies.cube.health(),
    )
    names = ("postgres", "clickhouse", "cube")
    statuses = {
        name: DependencyStatus(status="ready" if healthy else "unavailable")
        for name, healthy in zip(names, checks, strict=True)
    }
    is_ready = all(checks)
    response = ReadinessResponse(
        status="ready" if is_ready else "degraded",
        dependencies=statuses,
        configuration={
            "clerk": bool(request.app.state.settings.clerk_issuer),
            "e2b": bool(request.app.state.settings.e2b_api_key),
            "telemetry_export": bool(
                request.app.state.settings.otel_exporter_otlp_endpoint
            ),
        },
    )
    return JSONResponse(
        status_code=status.HTTP_200_OK
        if is_ready
        else status.HTTP_503_SERVICE_UNAVAILABLE,
        content=response.model_dump(mode="json"),
    )


@router.get("/v1/context", response_model=ContextResponse)
async def context(
    request: Request,
    authorization: Annotated[str | None, Header()] = None,
) -> ContextResponse:
    try:
        token = bearer_token(authorization)
        principal = await request.app.state.dependencies.jwt_verifier.verify(token)
        async with request.app.state.dependencies.database.engine.begin() as connection:
            identity = await resolve_identity_context(
                connection,
                provider="clerk",
                external_subject_id=principal.subject_id,
                external_tenant_id=principal.organization_id,
            )
    except AuthenticationError as error:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=str(error),
        ) from error
    except IdentityNotBoundError as error:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=str(error),
        ) from error

    correlate_tenant(identity.tenant_id)
    return ContextResponse(
        user_id=identity.user_id,
        tenant_id=identity.tenant_id,
        email=identity.email,
        tenant_name=identity.tenant_name,
        role=identity.role,
    )
