"""The seams the sequence application talks through.

Protocols rather than base classes, so an adapter satisfies one by shape and
the application never imports it — enforced by the import-linter contracts
rather than by review.
"""

from __future__ import annotations

from contextlib import AbstractAsyncContextManager
from typing import Protocol
from uuid import UUID

from zentra_domain_sequence import RawTableReference, Sequence

from .dto import SequenceListItem


class SequenceRepository(Protocol):
    async def add_sequence(self, sequence: Sequence) -> None: ...

    async def get_sequence(
        self, sequence_id: UUID, *, organization_id: UUID, for_update: bool = False
    ) -> Sequence | None: ...

    async def list_sequences(
        self, *, organization_id: UUID, dataset_workspace_id: UUID
    ) -> tuple[SequenceListItem, ...]: ...

    async def mark_final(
        self,
        *,
        sequence_id: UUID,
        prepared_table_id: UUID,
        organization_id: UUID,
        marked_at: object,
    ) -> None: ...

    async def unmark_final(
        self,
        *,
        sequence_id: UUID,
        prepared_table_id: UUID,
        organization_id: UUID,
    ) -> None: ...


class SequenceUnitOfWork(Protocol):
    sequences: SequenceRepository
    should_commit: bool

    async def commit(self) -> None: ...


class SequenceUnitOfWorkFactory(Protocol):
    def __call__(
        self, organization_id: UUID, trace_id: UUID, span_id: UUID
    ) -> AbstractAsyncContextManager[SequenceUnitOfWork]: ...


class RawTableResolver(Protocol):
    """Confirms a Raw Table a manual create requested actually exists.

    Implemented as a closure over the Connector application service — this
    protocol exists so `SequenceService` never imports Connector directly.
    """

    async def label(
        self, organization_id: UUID, reference: RawTableReference
    ) -> str | None: ...
