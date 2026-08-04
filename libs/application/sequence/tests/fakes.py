"""In-memory fakes for SequenceService's ports — no Postgres, no I/O."""

from __future__ import annotations

from collections import Counter
from contextlib import AbstractAsyncContextManager
from uuid import UUID

from zentra_domain_sequence import RawTableReference, Sequence

from zentra_application_sequence import (
    SequenceListItem,
    SequenceOrigin,
    raw_table_label,
)


class FakeSequenceRepository:
    def __init__(self) -> None:
        self.sequences: dict[UUID, Sequence] = {}

    async def add_sequence(self, sequence: Sequence) -> None:
        self.sequences[sequence.sequence_id] = sequence

    async def get_sequence(
        self, sequence_id: UUID, *, for_update: bool = False
    ) -> Sequence | None:
        del for_update
        return self.sequences.get(sequence_id)

    async def list_sequences(
        self, *, organization_id: UUID, dataset_workspace_id: UUID
    ) -> tuple[SequenceListItem, ...]:
        matches = [
            sequence
            for sequence in self.sequences.values()
            if sequence.organization_id == organization_id
            and sequence.dataset_workspace_id == dataset_workspace_id
        ]
        matches.sort(key=lambda s: (s.updated_at, s.sequence_id), reverse=True)
        items = []
        for sequence in matches:
            failed_runs = Counter(
                run.outcome.kind for run in sequence.runs
            )["failed"]
            items.append(
                SequenceListItem(
                    sequence_id=sequence.sequence_id,
                    thread_id=sequence.thread_id,
                    origin=(
                        SequenceOrigin.MANUAL
                        if sequence.thread_id is not None
                        else SequenceOrigin.CHAT
                    ),
                    raw_table=sequence.raw_table_reference,
                    raw_table_label=raw_table_label(sequence.raw_table_reference),
                    step_count=len(sequence.steps),
                    final_table_count=len(sequence.final_table_ids),
                    failed_run_count=failed_runs,
                    created_at=sequence.created_at,
                    updated_at=sequence.updated_at,
                )
            )
        return tuple(items)


class FakeSequenceUnitOfWork:
    def __init__(self, repository: FakeSequenceRepository) -> None:
        self.sequences = repository
        self.should_commit = False

    async def __aenter__(self) -> FakeSequenceUnitOfWork:
        return self

    async def __aexit__(self, *args: object) -> None:
        return None

    async def commit(self) -> None:
        self.should_commit = True


class FakeSequenceUnitOfWorkFactory:
    def __init__(self, repository: FakeSequenceRepository) -> None:
        self.repository = repository

    def __call__(
        self, organization_id: UUID, trace_id: UUID, span_id: UUID
    ) -> AbstractAsyncContextManager[FakeSequenceUnitOfWork]:
        del organization_id, trace_id, span_id
        return FakeSequenceUnitOfWork(self.repository)


class FakeRawTableResolver:
    """Resolves every Raw Table in `known` to a fixed label; everything else
    is unknown, as a real Connector lookup would answer for a bad reference."""

    def __init__(self, known: dict[tuple[UUID, str], str] | None = None) -> None:
        self.known = known or {}

    async def label(
        self, organization_id: UUID, reference: RawTableReference
    ) -> str | None:
        return self.known.get((organization_id, raw_table_label(reference)))
