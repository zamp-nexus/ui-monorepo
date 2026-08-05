"""Typed persistence seam shared by Analysis Run collaborators."""

from __future__ import annotations

from contextlib import AbstractAsyncContextManager
from typing import Protocol
from uuid import UUID

from zentra_application_analysis_run import AnalysisRunUnitOfWork


class AnalysisRunUnitOfWorkFactory(Protocol):
    """Creates the tenant-bound transaction used by one orchestration step."""

    def __call__(
        self, organization_id: UUID, trace_id: UUID, span_id: UUID
    ) -> AbstractAsyncContextManager[AnalysisRunUnitOfWork]: ...
