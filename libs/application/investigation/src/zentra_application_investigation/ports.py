"""The seams the application talks through.

Split from `service.py` alongside `dto.py`. Protocols rather than base classes,
so an adapter satisfies one by shape and the application never imports it.
"""

from __future__ import annotations

from collections.abc import Sequence
from contextlib import AbstractAsyncContextManager
from typing import Protocol
from uuid import UUID

from zentra_domain_agent_execution import AgentExecutionRecord
from zentra_domain_investigation import (
    DomainEvent,
    DraftFinding,
    EvidenceCitation,
    HumanApproval,
    Investigation,
)

from .dto import PipelineResult, TimelineEntry


class InvestigationPipeline(Protocol):
    async def run(
        self,
        *,
        investigation_id: UUID,
        tenant_id: UUID,
        question: str,
        model_tier: str,
    ) -> PipelineResult: ...


class InvestigationRepository(Protocol):
    async def add(self, investigation: Investigation) -> None: ...

    async def get(
        self,
        investigation_id: UUID,
        *,
        for_update: bool = False,
    ) -> Investigation | None: ...

    async def save(
        self,
        investigation: Investigation,
        *,
        expected_version: int,
    ) -> None: ...


class HumanApprovalRepository(Protocol):
    async def add(self, approval: HumanApproval) -> None: ...

    async def get_for_investigation(
        self,
        investigation_id: UUID,
        *,
        approval_id: UUID | None = None,
        for_update: bool = False,
    ) -> HumanApproval | None: ...

    async def save(self, approval: HumanApproval) -> None: ...


class AgentExecutionRepository(Protocol):
    async def add(self, execution: AgentExecutionRecord) -> None: ...


class EvidenceCitationRepository(Protocol):
    async def add(
        self,
        citations: Sequence[EvidenceCitation],
    ) -> None: ...

    async def for_investigation(
        self,
        investigation_id: UUID,
    ) -> tuple[EvidenceCitation, ...]: ...

    async def resolve(
        self,
        investigation_id: UUID,
        citation_id: UUID,
    ) -> EvidenceCitation | None: ...


class DraftFindingRepository(Protocol):
    async def add(self, draft: DraftFinding) -> None: ...

    async def latest_for_investigation(
        self,
        investigation_id: UUID,
    ) -> DraftFinding | None: ...


class TenantPolicyRepository(Protocol):
    async def confidence_threshold(self, tenant_id: UUID) -> float: ...

    async def model_tier(self, tenant_id: UUID) -> str: ...


class AuditOutboxRepository(Protocol):
    async def enqueue(self, events: Sequence[DomainEvent]) -> None: ...


class InvestigationUnitOfWork(Protocol):
    investigations: InvestigationRepository
    approvals: HumanApprovalRepository
    agent_executions: AgentExecutionRepository
    draft_findings: DraftFindingRepository
    citations: EvidenceCitationRepository
    policies: TenantPolicyRepository
    outbox: AuditOutboxRepository

    async def commit(self) -> None: ...


class InvestigationUnitOfWorkFactory(Protocol):
    def __call__(
        self,
        tenant_id: UUID,
        trace_id: UUID,
        span_id: UUID,
    ) -> AbstractAsyncContextManager[InvestigationUnitOfWork]: ...


class AuditWriter(Protocol):
    async def flush(self, *, tenant_id: UUID, investigation_id: UUID) -> bool: ...


class AuditReader(Protocol):
    async def list_timeline(
        self,
        *,
        tenant_id: UUID,
        investigation_id: UUID,
    ) -> Sequence[TimelineEntry]: ...
