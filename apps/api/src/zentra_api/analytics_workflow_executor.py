"""Adapter that registers the trusted Analytics loop as a system Workflow."""

from __future__ import annotations

from collections.abc import AsyncIterator
from uuid import UUID

from zentra_application_analysis_run import (
    AuthenticatedActor,
    ThreadDetail,
    ThreadService,
    ThreadStreamEvent,
    RoutingResult,
)

from .workflow_schemas import DEFAULT_WORKFLOW_ID


class AnalyticsWorkflowExecutor:
    """Runs the system-owned Workflow through the existing governed loop.

    The Analytics loop remains the only system Workflow that can produce a
    governed Finding. This adapter gives it the same explicit Workflow seam as
    custom published versions without replacing its proven job lifecycle.
    """

    workflow_id = DEFAULT_WORKFLOW_ID

    def __init__(self, threads: ThreadService) -> None:
        self._threads = threads

    async def create(
        self,
        actor: AuthenticatedActor,
        *,
        project_id: UUID,
        content: str,
        data_connection_id: UUID | tuple[UUID, ...] | None,
        routing: RoutingResult | None = None,
    ) -> ThreadDetail:
        return await self._threads.create(
            actor,
            project_id=project_id,
            content=content,
            data_connection_id=data_connection_id,
            routing=routing,
        )

    def create_streaming(
        self,
        actor: AuthenticatedActor,
        *,
        project_id: UUID,
        content: str,
        data_connection_id: UUID | tuple[UUID, ...] | None,
        routing: RoutingResult | None = None,
    ) -> AsyncIterator[ThreadStreamEvent]:
        return self._threads.create_streaming(
            actor,
            project_id=project_id,
            content=content,
            data_connection_id=data_connection_id,
            routing=routing,
        )

    async def append(
        self,
        actor: AuthenticatedActor,
        *,
        thread_id: UUID,
        content: str,
        data_connection_id: UUID | tuple[UUID, ...] | None,
        routing: RoutingResult | None = None,
    ) -> ThreadDetail:
        return await self._threads.append(
            actor,
            thread_id=thread_id,
            content=content,
            data_connection_id=data_connection_id,
            routing=routing,
        )

    def append_streaming(
        self,
        actor: AuthenticatedActor,
        *,
        thread_id: UUID,
        content: str,
        data_connection_id: UUID | tuple[UUID, ...] | None,
        routing: RoutingResult | None = None,
    ) -> AsyncIterator[ThreadStreamEvent]:
        return self._threads.append_streaming(
            actor,
            thread_id=thread_id,
            content=content,
            data_connection_id=data_connection_id,
            routing=routing,
        )
