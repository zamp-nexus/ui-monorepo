from __future__ import annotations

import asyncio
from contextlib import suppress
from datetime import datetime
from typing import Annotated, Literal
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
from pydantic import BaseModel, ConfigDict, Field, model_validator
from zentra_application_investigation import (
    AuthenticatedActor,
    ConflictError,
    InvestigationDetail,
    InvestigationNotFoundError,
    InvestigationService,
    PermissionDeniedError,
    ScenarioUnavailableError,
    UnsupportedScenarioError,
)
from zentra_domain_agent_execution import ConfidenceOutcome, ValidationOutcome
from zentra_domain_investigation import ApprovalDecision, RejectionReason

from .request_context import RequestContext, authenticated_context

router = APIRouter()
AuthenticatedRequest = Annotated[RequestContext, Depends(authenticated_context)]


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


class InvestigationCreateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    scenario_key: str


class ApprovalDecisionRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    decision: ApprovalDecision
    reason: RejectionReason | None = None

    @model_validator(mode="after")
    def validate_reason(self) -> ApprovalDecisionRequest:
        if self.decision is ApprovalDecision.REJECT and self.reason is None:
            raise ValueError("A rejection reason is required")
        if self.decision is ApprovalDecision.APPROVE and self.reason is not None:
            raise ValueError("Approval must not include a rejection reason")
        return self


class MetricComparisonResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    metric: str
    previous_value: str
    current_value: str
    unit: str


class FindingResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    headline: str
    summary: str
    metrics: list[MetricComparisonResponse]
    evidence_references: list[str]


class ValidationResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    kind: Literal["validation"] = "validation"
    passed: bool
    checks: list[str]
    issues: list[str]


class ConfidenceResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    kind: Literal["confidence"] = "confidence"
    score: float
    calibration_method: str


OutcomeResponse = Annotated[
    ConfidenceResponse | ValidationResponse,
    Field(discriminator="kind"),
]


class ApprovalResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    approval_id: UUID
    reason: str
    requested_at: datetime
    can_decide: bool


class TimelineResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    entry_id: UUID
    event_type: str
    status: str
    created_at: datetime
    artifact_references: list[str]
    delivery: str
    agent_id: str | None = None
    step: int | None = None


class InvestigationDetailResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    investigation_id: UUID
    canonical_question: str
    scenario_key: str
    status: str
    version: int
    evaluation_attempts: int
    created_at: datetime
    updated_at: datetime
    finished_at: datetime | None
    finding: FindingResponse | None
    outcome: OutcomeResponse | None
    pending_approval: ApprovalResponse | None
    timeline: list[TimelineResponse]
    audit_delivery: str

    @classmethod
    def from_detail(cls, detail: InvestigationDetail) -> InvestigationDetailResponse:
        finding = None
        if detail.finding is not None:
            finding = FindingResponse(
                headline=detail.finding.headline,
                summary=detail.finding.summary,
                metrics=[
                    MetricComparisonResponse(
                        metric=metric.metric,
                        previous_value=metric.previous_value,
                        current_value=metric.current_value,
                        unit=metric.unit,
                    )
                    for metric in detail.finding.metrics
                ],
                evidence_references=[
                    reference.value for reference in detail.finding.evidence_refs
                ],
            )
        outcome: OutcomeResponse | None = None
        if isinstance(detail.outcome, ConfidenceOutcome):
            outcome = ConfidenceResponse(
                score=detail.outcome.score,
                calibration_method=detail.outcome.calibration_method,
            )
        elif isinstance(detail.outcome, ValidationOutcome):
            outcome = ValidationResponse(
                passed=detail.outcome.passed,
                checks=list(detail.outcome.checks),
                issues=list(detail.outcome.issues),
            )
        approval = None
        if detail.pending_approval is not None:
            approval = ApprovalResponse(
                approval_id=detail.pending_approval.approval_id,
                reason=detail.pending_approval.reason,
                requested_at=detail.pending_approval.requested_at,
                can_decide=detail.pending_approval.can_decide,
            )
        return cls(
            investigation_id=detail.investigation_id,
            canonical_question=detail.question,
            scenario_key=detail.scenario_key,
            status=detail.status.value,
            version=detail.version,
            evaluation_attempts=detail.evaluation_attempts,
            created_at=detail.created_at,
            updated_at=detail.updated_at,
            finished_at=detail.finished_at,
            finding=finding,
            outcome=outcome,
            pending_approval=approval,
            timeline=[
                TimelineResponse(
                    entry_id=entry.entry_id,
                    event_type=entry.event_type,
                    status=entry.status,
                    created_at=entry.created_at,
                    artifact_references=list(entry.artifact_refs),
                    delivery=entry.delivery.value,
                    agent_id=entry.agent_id,
                    step=entry.step,
                )
                for entry in detail.timeline
            ],
            audit_delivery=detail.audit_delivery.value,
        )


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
