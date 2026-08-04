"""HTTP surface for the Sequence context.

A thin translation layer, following `connector_routes.py`'s shape: every
decision about what is allowed lives in `SequenceService`, and `_handle`
centralises the exception-to-status-code mapping so no route can disagree
with another about what a given failure means.
"""

from __future__ import annotations

from collections.abc import Iterator
from contextlib import contextmanager
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request, status
from zentra_application_analysis_run import (
    PermissionDeniedError as ThreadPermissionDeniedError,
)
from zentra_application_analysis_run import ThreadConflictError
from zentra_application_analysis_run import (
    ThreadNotFoundError as ThreadServiceNotFoundError,
)
from zentra_application_sequence import (
    AuthenticatedActor,
    PermissionDeniedError,
    PreparedTableNotFoundError,
    RawTableNotFoundError,
    Role,
    SequenceNotFoundError,
    SequenceService,
)
from zentra_domain_analysis_run import ThreadMessageError

from .request_context import RequestContext, authenticated_context
from .sequence_schemas import (
    CreateSequenceRequest,
    PreparedTablePreviewResponse,
    SequenceGraphResponse,
    SequenceListResponse,
    raw_table_request_to_domain,
)

router = APIRouter(prefix="/v1/sequences", tags=["sequence"])
AuthenticatedRequest = Annotated[RequestContext, Depends(authenticated_context)]


@contextmanager
def _handle() -> Iterator[None]:
    try:
        yield
    except PermissionDeniedError as error:
        raise HTTPException(status.HTTP_403_FORBIDDEN, str(error)) from error
    except (
        SequenceNotFoundError,
        PreparedTableNotFoundError,
        RawTableNotFoundError,
    ) as error:
        raise HTTPException(status.HTTP_404_NOT_FOUND, str(error)) from error
    except (
        ThreadPermissionDeniedError,
        ThreadServiceNotFoundError,
        ThreadConflictError,
        ThreadMessageError,
    ) as error:
        # A manual create's first step is opening the scoped thread; a
        # failure there is reported the same way a Sequence-side failure is,
        # since the caller asked for one operation and does not need to know
        # it spans two application services.
        raise HTTPException(status.HTTP_409_CONFLICT, str(error)) from error


def _service(request: Request) -> SequenceService:
    """The Sequence Service, or a 503 saying why there isn't one.

    Absent whenever Connector is unconfigured, since `SequenceService`'s
    `RawTableResolver` is built over `ConnectorService` — see
    `dependencies.py`.
    """
    service = getattr(request.app.state.dependencies, "sequences", None)
    if service is None:
        raise HTTPException(
            status.HTTP_503_SERVICE_UNAVAILABLE,
            "Sequence is not configured: Connector must be configured first",
        )
    return service


def _actor(context: RequestContext) -> AuthenticatedActor:
    """Re-express the request's actor in the sequence application's own
    vocabulary — translated rather than shared, as `connector_routes.py`
    does, so the two contexts stay free to evolve independently."""
    return AuthenticatedActor(
        user_id=context.actor.user_id,
        organization_id=context.actor.organization_id,
        role=Role(context.actor.role.value),
    )


@router.get("", response_model=SequenceListResponse)
async def list_sequences(
    request: Request, context: AuthenticatedRequest
) -> SequenceListResponse:
    with _handle():
        result = await _service(request).list(_actor(context))
    return SequenceListResponse.from_slice(result)


@router.get("/{sequence_id}", response_model=SequenceGraphResponse)
async def get_sequence(
    request: Request, context: AuthenticatedRequest, sequence_id: UUID
) -> SequenceGraphResponse:
    with _handle():
        view = await _service(request).get(_actor(context), sequence_id)
    return SequenceGraphResponse.from_view(view)


@router.get(
    "/{sequence_id}/prepared-tables/{prepared_table_id}",
    response_model=PreparedTablePreviewResponse,
)
async def preview_prepared_table(
    request: Request,
    context: AuthenticatedRequest,
    sequence_id: UUID,
    prepared_table_id: UUID,
) -> PreparedTablePreviewResponse:
    with _handle():
        preview = await _service(request).preview_prepared_table(
            _actor(context), sequence_id, prepared_table_id
        )
    return PreparedTablePreviewResponse.from_preview(preview)


@router.post(
    "", response_model=SequenceGraphResponse, status_code=status.HTTP_201_CREATED
)
async def create_sequence(
    request: Request, context: AuthenticatedRequest, body: CreateSequenceRequest
) -> SequenceGraphResponse:
    with _handle():
        thread = await request.app.state.dependencies.threads.create(
            context.actor, project_id=body.project_id, content=body.message
        )
        view = await _service(request).create(
            _actor(context),
            raw_table=raw_table_request_to_domain(body.raw_table),
            thread_id=thread.thread_id,
        )
    return SequenceGraphResponse.from_view(view)
