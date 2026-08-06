"""SequenceService — the single seam the Sequence page is driven through.

Every externally meaningful behaviour lives behind a method here: listing a
Dataset Workspace's Sequences, reading one Sequence's full graph, previewing
a Prepared Table, and creating a new Sequence (the manual creation path).
"""

from __future__ import annotations

from collections.abc import Callable
from datetime import datetime
from uuid import UUID

from zentra_domain_sequence import RawTableReference, Sequence

from .dto import (
    AuthenticatedActor,
    PreparedTablePreview,
    RawTableNotFoundError,
    SequenceGraphView,
    SequenceNotFoundError,
    SequenceSlice,
)
from .lineage import build_graph_view, build_preview
from .ports import RawTableResolver, SequenceUnitOfWorkFactory
from .workspace import dataset_workspace_id_for


class SequenceService:
    def __init__(
        self,
        *,
        unit_of_work_factory: SequenceUnitOfWorkFactory,
        raw_tables: RawTableResolver,
        now: Callable[[], datetime],
        new_id: Callable[[], UUID],
    ) -> None:
        self._unit_of_work_factory = unit_of_work_factory
        self._raw_tables = raw_tables
        self._now = now
        self._new_id = new_id

    async def list(self, actor: AuthenticatedActor) -> SequenceSlice:
        dataset_workspace_id = dataset_workspace_id_for(actor.organization_id)
        async with self._uow(actor) as unit_of_work:
            items = await unit_of_work.sequences.list_sequences(
                organization_id=actor.organization_id,
                dataset_workspace_id=dataset_workspace_id,
            )
        return SequenceSlice(
            dataset_workspace_id=dataset_workspace_id, items=items
        )

    async def get(
        self, actor: AuthenticatedActor, sequence_id: UUID
    ) -> SequenceGraphView:
        sequence = await self._load(actor, sequence_id)
        return build_graph_view(sequence)

    async def preview_prepared_table(
        self, actor: AuthenticatedActor, sequence_id: UUID, prepared_table_id: UUID
    ) -> PreparedTablePreview:
        sequence = await self._load(actor, sequence_id)
        return build_preview(sequence, prepared_table_id)

    async def create(
        self,
        actor: AuthenticatedActor,
        *,
        raw_table: RawTableReference,
        thread_id: UUID | None,
    ) -> SequenceGraphView:
        """Creates a Sequence pointed at `raw_table`.

        The Raw Table is confirmed to exist before anything is persisted — a
        Sequence whose first chat turn immediately fails with
        `unknown_table` would leave someone unsure whether they mistyped the
        table or misunderstood the picker.
        """
        label = await self._raw_tables.label(actor.organization_id, raw_table)
        if label is None:
            raise RawTableNotFoundError(
                "The selected Raw Table could not be found"
            )
        now = self._now()
        sequence = Sequence.create(
            sequence_id=self._new_id(),
            organization_id=actor.organization_id,
            dataset_workspace_id=dataset_workspace_id_for(actor.organization_id),
            raw_table_reference=raw_table,
            now=now,
            thread_id=thread_id,
        )
        async with self._uow(actor) as unit_of_work:
            await unit_of_work.sequences.add_sequence(sequence)
            await unit_of_work.commit()
        return build_graph_view(sequence)

    async def _load(self, actor: AuthenticatedActor, sequence_id: UUID) -> Sequence:
        async with self._uow(actor) as unit_of_work:
            sequence = await unit_of_work.sequences.get_sequence(
                sequence_id, organization_id=actor.organization_id
            )
        if sequence is None or sequence.organization_id != actor.organization_id:
            raise SequenceNotFoundError(f"No Sequence {sequence_id} found")
        return sequence

    def _uow(self, actor: AuthenticatedActor):
        return self._unit_of_work_factory(
            actor.organization_id, self._new_id(), self._new_id()
        )
