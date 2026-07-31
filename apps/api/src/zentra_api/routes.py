from __future__ import annotations

import asyncio
from contextlib import suppress
from time import perf_counter
from typing import Annotated
from uuid import UUID

from fastapi import (
    APIRouter,
    BackgroundTasks,
    Depends,
    HTTPException,
    Request,
    status,
)
from fastapi.responses import JSONResponse
from zentra_adapter_telemetry import record_citation_resolution
from zentra_application_investigation import (
    SCENARIOS,
    AuthenticatedActor,
    ConflictError,
    InvestigationNotFoundError,
    InvestigationService,
    PermissionDeniedError,
    ScenarioUnavailableError,
    UnsupportedScenarioError,
)

from .request_context import RequestContext, authenticated_context
from .schemas import (
    ApprovalDecisionRequest,
    ContextResponse,
    DependencyStatus,
    EvidenceCitationResponse,
    InvestigationCreateRequest,
    InvestigationDetailResponse,
    ReadinessResponse,
    ScenarioResponse,
)

router = APIRouter()
AuthenticatedRequest = Annotated[RequestContext, Depends(authenticated_context)]


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
    resolved: AuthenticatedRequest,
) -> ContextResponse:
    identity = resolved.identity
    return ContextResponse(
        user_id=identity.user_id,
        tenant_id=identity.tenant_id,
        email=identity.email,
        tenant_name=identity.tenant_name,
        role=identity.role,
    )


@router.get("/v1/scenarios", response_model=list[ScenarioResponse])
async def scenarios(
    # Unused, but the dependency is the point: the catalogue of questions is
    # behind authentication like everything else.
    _: AuthenticatedRequest,
) -> list[ScenarioResponse]:
    """The governed questions this deployment will answer.

    Served rather than hardcoded in the client so the question text has one
    home: the launcher renders whatever the API supports, and adding a scenario
    is a server change alone.
    """
    return [
        ScenarioResponse(
            key=scenario.key,
            question=scenario.question,
            facts=list(scenario.facts),
        )
        for scenario in SCENARIOS.values()
    ]


@router.post(
    "/v1/investigations",
    response_model=InvestigationDetailResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_investigation(
    body: InvestigationCreateRequest,
    request: Request,
    background: BackgroundTasks,
    resolved: AuthenticatedRequest,
) -> InvestigationDetailResponse:
    investigations = request.app.state.dependencies.investigations
    try:
        detail = await investigations.start(
            resolved.actor,
            scenario_key=body.scenario_key,
        )
    except UnsupportedScenarioError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error
    except PermissionDeniedError as error:
        raise HTTPException(status_code=403, detail=str(error)) from error
    except ScenarioUnavailableError as error:
        raise HTTPException(status_code=503, detail=str(error)) from error

    # The agents run after the response is sent; the client polls GET for the
    # timeline as each step lands.
    background.add_task(
        _run_pipeline,
        investigations,
        resolved.actor,
        detail.investigation_id,
    )
    return InvestigationDetailResponse.from_detail(detail)


async def _run_pipeline(
    investigations: InvestigationService,
    actor: AuthenticatedActor,
    investigation_id: UUID,
) -> None:
    with suppress(Exception):
        # Failures are already recorded against the Investigation itself, so a
        # background crash must not take the worker down with it.
        await investigations.execute(actor, investigation_id)


@router.get(
    "/v1/investigations/{investigation_id}",
    response_model=InvestigationDetailResponse,
)
async def get_investigation(
    investigation_id: UUID,
    request: Request,
    resolved: AuthenticatedRequest,
) -> InvestigationDetailResponse:
    try:
        detail = await request.app.state.dependencies.investigations.get(
            resolved.actor,
            investigation_id,
        )
    except InvestigationNotFoundError as error:
        raise HTTPException(status_code=404, detail=str(error)) from error
    return InvestigationDetailResponse.from_detail(detail)


@router.get(
    "/v1/investigations/{investigation_id}/citations/{citation_id}",
    response_model=EvidenceCitationResponse,
)
async def resolve_citation(
    investigation_id: UUID,
    citation_id: UUID,
    request: Request,
    resolved: AuthenticatedRequest,
) -> EvidenceCitationResponse:
    """Follow one claim to the evidence behind it.

    Nested under the Investigation so the Investigation's own visibility is
    checked first: a citation id must not become a way to probe an
    Investigation the caller cannot read.

    There is no Tenant parameter, here or anywhere below. Identity comes from
    the verified token, so there is nothing for a caller to supply or override.
    """
    started = perf_counter()
    # Distinct from `inaccessible`: an operator has to be able to tell a denial
    # from a fault, and seeding the denial value would report every database
    # failure as an authorization outcome.
    state = "failed"
    try:
        citation = await request.app.state.dependencies.investigations.resolve_citation(
            resolved.actor,
            investigation_id=investigation_id,
            citation_id=citation_id,
        )
    except InvestigationNotFoundError as error:
        state = "inaccessible"
        # Same answer for another Tenant's, another Investigation's, and
        # nonexistent. A caller who could tell them apart could confirm that
        # somebody else's evidence exists.
        raise HTTPException(status_code=404, detail="Evidence was not found") from error
    else:
        state = citation.state.value
        return EvidenceCitationResponse.from_domain(citation)
    finally:
        record_citation_resolution(
            state=state,
            duration_ms=int((perf_counter() - started) * 1000),
        )


@router.post(
    "/v1/investigations/{investigation_id}/approvals/{approval_id}/decision",
    response_model=InvestigationDetailResponse,
)
async def decide_approval(
    investigation_id: UUID,
    approval_id: UUID,
    body: ApprovalDecisionRequest,
    request: Request,
    resolved: AuthenticatedRequest,
) -> InvestigationDetailResponse:
    try:
        detail = await request.app.state.dependencies.investigations.decide(
            resolved.actor,
            investigation_id=investigation_id,
            approval_id=approval_id,
            decision=body.decision,
            rejection_reason=body.reason,
        )
    except PermissionDeniedError as error:
        raise HTTPException(status_code=403, detail=str(error)) from error
    except InvestigationNotFoundError as error:
        raise HTTPException(status_code=404, detail=str(error)) from error
    except ConflictError as error:
        raise HTTPException(status_code=409, detail=str(error)) from error
    return InvestigationDetailResponse.from_detail(detail)
