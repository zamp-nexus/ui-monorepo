from __future__ import annotations

import asyncio
from time import perf_counter
from typing import Annotated
from uuid import UUID

from fastapi import (
    APIRouter,
    Depends,
    HTTPException,
    Request,
    status,
)
from fastapi.responses import JSONResponse
from zentra_adapter_telemetry import (
    correlate_analysis_run,
    correlate_thread,
    record_citation_resolution,
)
from zentra_application_analysis_run import (
    AnalysisRunNotFoundError,
    ConflictError,
    PermissionDeniedError,
)
from zentra_application_connector import (
    AuthenticatedActor as ConnectorActor,
    CatalogVersionNotFoundError,
    Role as ConnectorRole,
)
from zentra_domain_agent_execution import PublicAgent
from zentra_domain_analysis_run import Tombstone

from .active_connection import (
    AmbiguousDataConnectionError,
    active_data_connection_id,
)
from .request_context import RequestContext, authenticated_context
from .schemas import (
    AnalysisRunDetailResponse,
    ApprovalDecisionRequest,
    CatalogMemberResponse,
    CatalogSourceResponse,
    OrganizationCatalogResponse,
    ContextResponse,
    DependencyStatus,
    EvidenceCitationResponse,
    EvidenceDeletionRequest,
    ReadinessResponse,
    TombstoneResponse,
    VisualizationActionRequest,
    VisualizationActionResponse,
    VisualizationResponse,
)

router = APIRouter()
AuthenticatedRequest = Annotated[RequestContext, Depends(authenticated_context)]


async def _active_connection(
    dependencies: object,
    actor: object,
    *,
    requested: UUID | None = None,
) -> UUID | None:
    """The Data Connection a question is asked against, or a 409 to choose."""
    try:
        return await active_data_connection_id(
            dependencies.connector,  # type: ignore[attr-defined]
            actor,  # type: ignore[arg-type]
            requested=requested,
        )
    except AmbiguousDataConnectionError as error:
        raise HTTPException(status_code=409, detail=str(error)) from error


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
        organization_id=identity.organization_id,
        email=identity.email,
        organization_name=identity.organization_name,
        role=identity.role,
    )


@router.get("/v1/catalog", response_model=OrganizationCatalogResponse)
async def catalog(
    request: Request,
    resolved: AuthenticatedRequest,
) -> OrganizationCatalogResponse:
    """The governed vocabulary this Organization may ask questions about.

    Resolved per Organization, so it is the Organization's own catalog and never
    another's
    — the whole reason `ScopedCubeSemanticLayers` exists. Measures and
    dimensions only: no rows, and no physical schema.
    """
    dependencies = request.app.state.dependencies

    def members(governed: object) -> tuple[list[CatalogMemberResponse], list[CatalogMemberResponse]]:
        return [
            CatalogMemberResponse(
                name=measure.name,
                type=measure.type,
                description=measure.description,
            )
            for measure in governed.measures  # type: ignore[attr-defined]
        ], [
            CatalogMemberResponse(
                name=dimension.name,
                type=dimension.type,
                description=dimension.description,
                values=list(dimension.values),
            )
            for dimension in governed.dimensions  # type: ignore[attr-defined]
        ]

    connector = dependencies.connector
    if connector is None:
        try:
            governed = await dependencies.semantic_layers.resolve(
                organization_id=resolved.actor.organization_id, data_connection_id=None
            )
        except CatalogVersionNotFoundError as error:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="No catalog has been harvested for this data connection yet.",
            ) from error
        measures, dimensions = members(await governed.catalog())
        return OrganizationCatalogResponse(
            measures=measures,
            dimensions=dimensions,
            sources=[CatalogSourceResponse(name="Demo warehouse", kind="demo", status="ready", measures=measures, dimensions=dimensions)],
        )

    actor = ConnectorActor(
        user_id=resolved.actor.user_id,
        organization_id=resolved.actor.organization_id,
        role=ConnectorRole(resolved.actor.role.value),
    )
    sources: list[CatalogSourceResponse] = []
    measures: list[CatalogMemberResponse] = []
    dimensions: list[CatalogMemberResponse] = []
    for source in await connector.list_sources(actor):
        if source.health.value != "reachable":
            sources.append(CatalogSourceResponse(data_source_id=source.data_source_id, name=source.name, kind=source.kind.value, status="unreachable"))
            continue
        try:
            layer = await dependencies.semantic_layers.resolve(
                organization_id=resolved.actor.organization_id,
                data_connection_id=source.data_source_id,
            )
            source_measures, source_dimensions = members(await layer.catalog())
        except CatalogVersionNotFoundError:
            sources.append(CatalogSourceResponse(data_source_id=source.data_source_id, name=source.name, kind=source.kind.value, status="not_harvested"))
            continue
        status_name = "ready" if source.kind.value == "connected" else "execution_not_supported"
        sources.append(CatalogSourceResponse(data_source_id=source.data_source_id, name=source.name, kind=source.kind.value, status=status_name, measures=source_measures, dimensions=source_dimensions))
        if status_name == "ready":
            measures.extend(source_measures)
            dimensions.extend(source_dimensions)
    return OrganizationCatalogResponse(measures=measures, dimensions=dimensions, sources=sources)


@router.get("/v1/agents", response_model=list[PublicAgent])
async def agents(request: Request, _: AuthenticatedRequest) -> list[PublicAgent]:
    return list(await request.app.state.dependencies.registry.public_agents())


@router.get(
    "/v1/analysis-runs/{analysis_run_id}",
    response_model=AnalysisRunDetailResponse,
)
async def get_analysis_run(
    analysis_run_id: UUID,
    request: Request,
    resolved: AuthenticatedRequest,
) -> AnalysisRunDetailResponse:
    try:
        detail = await request.app.state.dependencies.analysis_runs.get(
            resolved.actor,
            analysis_run_id,
        )
    except AnalysisRunNotFoundError as error:
        raise HTTPException(status_code=404, detail=str(error)) from error
    return AnalysisRunDetailResponse.from_detail(detail)


@router.post(
    "/v1/analysis-runs/{analysis_run_id}/cancel",
    response_model=AnalysisRunDetailResponse,
)
async def cancel_analysis_run(
    analysis_run_id: UUID,
    request: Request,
    resolved: AuthenticatedRequest,
) -> AnalysisRunDetailResponse:
    try:
        detail = await request.app.state.dependencies.analysis_runs.cancel(
            resolved.actor, analysis_run_id
        )
    except AnalysisRunNotFoundError as error:
        raise HTTPException(status_code=404, detail=str(error)) from error
    except PermissionDeniedError as error:
        raise HTTPException(status_code=403, detail=str(error)) from error
    except ConflictError as error:
        raise HTTPException(status_code=409, detail=str(error)) from error
    return AnalysisRunDetailResponse.from_detail(detail)


@router.post(
    "/v1/analysis-runs/{analysis_run_id}/retry",
    response_model=AnalysisRunDetailResponse,
    status_code=status.HTTP_201_CREATED,
)
async def retry_analysis_run(
    analysis_run_id: UUID,
    request: Request,
    resolved: AuthenticatedRequest,
) -> AnalysisRunDetailResponse:
    try:
        detail = await request.app.state.dependencies.analysis_runs.retry(
            resolved.actor, analysis_run_id
        )
    except AnalysisRunNotFoundError as error:
        raise HTTPException(status_code=404, detail=str(error)) from error
    except PermissionDeniedError as error:
        raise HTTPException(status_code=403, detail=str(error)) from error
    except ConflictError as error:
        raise HTTPException(status_code=409, detail=str(error)) from error
    return AnalysisRunDetailResponse.from_detail(detail)


@router.get(
    "/v1/analysis-runs/{analysis_run_id}/visualization",
    response_model=VisualizationResponse,
)
async def analysis_run_visualization(
    analysis_run_id: UUID,
    request: Request,
    resolved: AuthenticatedRequest,
) -> VisualizationResponse:
    try:
        detail = await request.app.state.dependencies.visualizations.for_analysis_run(
            resolved.actor, analysis_run_id
        )
    except AnalysisRunNotFoundError as error:
        raise HTTPException(status_code=404, detail=str(error)) from error
    return VisualizationResponse.from_detail(detail)


@router.get(
    "/v1/visualizations/{visualization_id}",
    response_model=VisualizationResponse,
)
async def get_visualization(
    visualization_id: UUID,
    request: Request,
    resolved: AuthenticatedRequest,
) -> VisualizationResponse:
    try:
        detail = await request.app.state.dependencies.visualizations.get(
            resolved.actor, visualization_id
        )
    except AnalysisRunNotFoundError as error:
        raise HTTPException(status_code=404, detail=str(error)) from error
    return VisualizationResponse.from_detail(detail)


@router.post(
    "/v1/visualizations/{visualization_id}/retry",
    response_model=VisualizationResponse,
    status_code=status.HTTP_201_CREATED,
)
async def retry_visualization(
    visualization_id: UUID,
    request: Request,
    resolved: AuthenticatedRequest,
) -> VisualizationResponse:
    try:
        detail = await request.app.state.dependencies.visualizations.retry(
            resolved.actor, visualization_id
        )
    except AnalysisRunNotFoundError as error:
        raise HTTPException(status_code=404, detail=str(error)) from error
    except ConflictError as error:
        raise HTTPException(status_code=409, detail=str(error)) from error
    return VisualizationResponse.from_detail(detail)


@router.post(
    "/v1/visualizations/{visualization_id}/actions/{action_id}/execute",
    response_model=VisualizationActionResponse,
)
async def execute_visualization_action(
    visualization_id: UUID,
    action_id: UUID,
    body: VisualizationActionRequest,
    request: Request,
    resolved: AuthenticatedRequest,
) -> VisualizationActionResponse:
    # C1-generated parameters are intentionally ignored. The opaque action ID
    # resolves to the server-stored mapping after Organization reauthorization.
    del body
    try:
        result = await request.app.state.dependencies.visualizations.execute_action(
            resolved.actor,
            visualization_id=visualization_id,
            action_id=action_id,
        )
    except AnalysisRunNotFoundError as error:
        raise HTTPException(status_code=404, detail=str(error)) from error
    except ConflictError as error:
        raise HTTPException(status_code=409, detail=str(error)) from error
    if result.thread_id is not None:
        correlate_thread(result.thread_id)
    return VisualizationActionResponse(
        kind=result.kind,
        citation_id=result.citation_id,
        thread_id=result.thread_id,
        analysis_run_id=result.analysis_run_id,
    )


@router.get(
    "/v1/analysis-runs/{analysis_run_id}/citations/{citation_id}",
    response_model=EvidenceCitationResponse | TombstoneResponse,
)
async def resolve_citation(
    analysis_run_id: UUID,
    citation_id: UUID,
    request: Request,
    resolved: AuthenticatedRequest,
) -> EvidenceCitationResponse | TombstoneResponse:
    """Follow one claim to the evidence behind it.

    Nested under the Analysis Run so the Analysis Run's own visibility is
    checked first: a citation id must not become a way to probe an
    Analysis Run the caller cannot read.

    There is no Organization parameter, here or anywhere below. Identity comes from
    the verified token, so there is nothing for a caller to supply or override.
    """
    started = perf_counter()
    # Distinct from `inaccessible`: an operator has to be able to tell a denial
    # from a fault, and seeding the denial value would report every database
    # failure as an authorization outcome.
    state = "failed"
    failure_category: str | None = None
    try:
        citation = await request.app.state.dependencies.analysis_runs.resolve_citation(
            resolved.actor,
            analysis_run_id=analysis_run_id,
            citation_id=citation_id,
        )
    except AnalysisRunNotFoundError as error:
        state = "inaccessible"
        failure_category = "not_visible_to_organization"
        # Same answer for another Organization's, another Analysis Run's, and
        # nonexistent. A caller who could tell them apart could confirm that
        # somebody else's evidence exists.
        raise HTTPException(status_code=404, detail="Evidence was not found") from error
    except Exception as error:
        # The class, never the message. "Timed out" and "the column does not
        # exist" are different operator problems and must not collapse into one
        # `failed` bucket, but the message that tells them apart can quote the
        # evidence.
        failure_category = type(error).__name__
        raise
    else:
        if isinstance(citation, Tombstone):
            state = "tombstoned"
            return TombstoneResponse(
                citation_id=citation.citation_id,
                category=citation.category,
                erased_at=citation.erased_at,
            )
        state = citation.state.value
        return EvidenceCitationResponse.from_domain(citation)
    finally:
        record_citation_resolution(
            state=state,
            duration_ms=int((perf_counter() - started) * 1000),
            failure_category=failure_category,
        )


@router.post(
    "/v1/analysis-runs/{analysis_run_id}/evidence-deletion",
    response_model=AnalysisRunDetailResponse,
)
async def delete_evidence(
    analysis_run_id: UUID,
    payload: EvidenceDeletionRequest,
    request: Request,
    resolved: AuthenticatedRequest,
) -> AnalysisRunDetailResponse:
    """Erase a terminal Analysis Run's evidence.

    The body must name the Analysis Run the path already names. It is a
    deliberate redundancy: an irreversible action should be impossible to
    trigger by replaying a URL, and a confirmation the client can default to
    would not be a confirmation.
    """
    correlate_analysis_run(analysis_run_id)
    if payload.confirm_analysis_run_id != analysis_run_id:
        raise HTTPException(
            status_code=422,
            detail="Confirm the analysis run whose evidence is being deleted",
        )
    try:
        detail = await request.app.state.dependencies.analysis_runs.delete_evidence(
            resolved.actor,
            analysis_run_id=analysis_run_id,
        )
    except PermissionDeniedError as error:
        raise HTTPException(status_code=403, detail=str(error)) from error
    except AnalysisRunNotFoundError as error:
        raise HTTPException(status_code=404, detail=str(error)) from error
    except ConflictError as error:
        raise HTTPException(status_code=409, detail=str(error)) from error
    return AnalysisRunDetailResponse.from_detail(detail)


@router.post(
    "/v1/analysis-runs/{analysis_run_id}/approvals/{approval_id}/decision",
    response_model=AnalysisRunDetailResponse,
)
async def decide_approval(
    analysis_run_id: UUID,
    approval_id: UUID,
    body: ApprovalDecisionRequest,
    request: Request,
    resolved: AuthenticatedRequest,
) -> AnalysisRunDetailResponse:
    try:
        detail = await request.app.state.dependencies.analysis_runs.decide(
            resolved.actor,
            analysis_run_id=analysis_run_id,
            approval_id=approval_id,
            decision=body.decision,
            rejection_reason=body.reason,
        )
    except PermissionDeniedError as error:
        raise HTTPException(status_code=403, detail=str(error)) from error
    except AnalysisRunNotFoundError as error:
        raise HTTPException(status_code=404, detail=str(error)) from error
    except ConflictError as error:
        raise HTTPException(status_code=409, detail=str(error)) from error
    return AnalysisRunDetailResponse.from_detail(detail)
