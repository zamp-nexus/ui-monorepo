"""ConnectorService — the single seam the connector is tested and driven through.

Every externally meaningful behaviour lives behind a method here: registering a
source, harvesting it, profiling it, proposing Relations, confirming them, and
serving the Join Graph that analytical agents are permitted to join on.

Authorization is checked at the top of each method rather than in a decorator,
because the roles differ by operation and a reader should be able to see which
one applies without following indirection.
"""

from __future__ import annotations

from collections.abc import AsyncIterator, Sequence
from uuid import UUID, uuid4

from zentra_domain_connector import (
    CatalogVersion,
    DataSource,
    HarvestBudget,
    HarvestRun,
    HarvestScope,
    JoinGraph,
    OverlapMeasurement,
    Relation,
    RelationOrigin,
    RelationState,
    SourceHealth,
    SourceKind,
    UploadFormat,
    diff_catalogs,
    infer_cardinality,
    score_candidate,
)
from zentra_domain_connector.constants import MAX_UPLOAD_BYTES
from zentra_domain_connector.inference import CandidatePair
from zentra_domain_connector.naming import name_affinity
from zentra_domain_connector.types import (
    BindingCeiling,
    RejectionReason,
    RelationTransitionError,
)

from .dto import (
    HARVEST_ROLES,
    WRITE_ROLES,
    AuthenticatedActor,
    CatalogVersionNotFoundError,
    ConflictError,
    ConnectionFailedError,
    DataSourceNotFoundError,
    HarvestRunNotFoundError,
    HarvestStatus,
    JoinGraphView,
    PermissionDeniedError,
    ReharvestReport,
    RelationNotFoundError,
    RelationView,
    SourceCredentials,
    SourceSummary,
    UploadPreview,
    UploadRejectedError,
)
from .harvesting import HarvestDependencies, execute_harvest
from .ports import (
    CatalogRepository,
    Clock,
    CredentialCipher,
    DataSourceRepository,
    FileLandingZone,
    HarvestRunRepository,
    RelationRepository,
    SourceConnector,
)
from .views import to_relation_view, to_status, to_summary


class ConnectorService:
    def __init__(
        self,
        *,
        sources: DataSourceRepository,
        catalogs: CatalogRepository,
        relations: RelationRepository,
        runs: HarvestRunRepository,
        connector: SourceConnector,
        cipher: CredentialCipher,
        landing_zone: FileLandingZone,
        clock: Clock,
    ) -> None:
        self._sources = sources
        self._catalogs = catalogs
        self._relations = relations
        self._runs = runs
        self._connector = connector
        self._cipher = cipher
        self._landing = landing_zone
        self._clock = clock
        self._pending_uploads: dict[UUID, tuple[UploadPreview, bytes]] = {}

    # ---------------------------------------------------------------- sources

    async def register_source(
        self,
        actor: AuthenticatedActor,
        *,
        name: str,
        credentials: SourceCredentials,
        description: str | None = None,
        store_sample_values: bool = False,
    ) -> SourceSummary:
        """Add a Data Source, but only once it is known to work.

        The connection is tested *before* anything is persisted. A source that
        was saved and then found unreachable would leave an admin unsure whether
        they had mistyped a password or misread a firewall, and would put a
        broken source in the list for everyone else to trip over.
        """
        self._require(actor, WRITE_ROLES)
        check = await self._connector.test_connection(credentials)
        if not check.reachable:
            assert check.failure is not None
            raise ConnectionFailedError(check.failure)

        now = self._clock.now()
        source = DataSource(
            data_source_id=uuid4(),
            tenant_id=actor.tenant_id,
            name=name,
            kind=SourceKind.CONNECTED,
            sealed_credentials=self._cipher.seal(credentials),
            description=description,
            health=SourceHealth.REACHABLE,
            store_sample_values=store_sample_values,
            last_verified_at=now,
            created_at=now,
            metadata={"host": credentials.host, "database": credentials.database},
        )
        await self._sources.add(source)
        return to_summary(source)

    async def list_sources(
        self, actor: AuthenticatedActor
    ) -> tuple[SourceSummary, ...]:
        sources = await self._sources.list(tenant_id=actor.tenant_id)
        return tuple(to_summary(s) for s in sources)

    async def get_source(
        self, actor: AuthenticatedActor, data_source_id: UUID
    ) -> SourceSummary:
        return to_summary(await self._load_source(actor, data_source_id))

    async def update_credentials(
        self,
        actor: AuthenticatedActor,
        data_source_id: UUID,
        *,
        credentials: SourceCredentials,
    ) -> SourceSummary:
        """Rotate a source's secret without disturbing anything attached to it.

        The source keeps its identity, so its catalog history and every
        confirmed Relation survive a password change — which is the difference
        between rotation being routine and rotation being feared.
        """
        self._require(actor, WRITE_ROLES)
        source = await self._load_source(actor, data_source_id)
        check = await self._connector.test_connection(credentials)
        if not check.reachable:
            assert check.failure is not None
            raise ConnectionFailedError(check.failure)

        source.sealed_credentials = self._cipher.seal(credentials)
        source.metadata = {"host": credentials.host, "database": credentials.database}
        source.mark_reachable(at=self._clock.now())
        await self._sources.save(source)
        return to_summary(source)

    async def test_connection(
        self, actor: AuthenticatedActor, data_source_id: UUID
    ) -> SourceSummary:
        source = await self._load_source(actor, data_source_id)
        check = await self._connector.test_connection(self._open(source))
        now = self._clock.now()
        if check.reachable:
            source.mark_reachable(at=now)
        else:
            source.mark_unreachable(at=now)
        await self._sources.save(source)
        if not check.reachable:
            assert check.failure is not None
            raise ConnectionFailedError(check.failure)
        return to_summary(source)

    async def delete_source(
        self, actor: AuthenticatedActor, data_source_id: UUID
    ) -> None:
        """Remove a source, and for an uploaded one, the data behind it.

        Dropping the landed table matters: an uploaded Data Source whose rows
        outlived its deletion would mean deletion did not mean deletion.
        """
        self._require(actor, WRITE_ROLES)
        source = await self._load_source(actor, data_source_id)
        if source.kind is SourceKind.UPLOADED and source.landed_table:
            database, _, table = source.landed_table.partition(".")
            await self._landing.drop(database=database, table=table)
        await self._sources.delete(data_source_id, tenant_id=actor.tenant_id)

    # --------------------------------------------------------------- harvests

    async def start_harvest(
        self,
        actor: AuthenticatedActor,
        data_source_id: UUID,
        *,
        scope: HarvestScope | None = None,
        budget: HarvestBudget | None = None,
    ) -> HarvestStatus:
        """Begin discovery, returning something to watch rather than a result.

        Refuses a second concurrent run on the same source: two runs
        interleaving their writes would produce a Catalog Version that never
        existed at any moment in the source.
        """
        self._require(actor, HARVEST_ROLES)
        source = await self._load_source(actor, data_source_id)
        active = await self._runs.active_for_source(
            data_source_id, tenant_id=actor.tenant_id
        )
        if active is not None:
            raise ConflictError("A harvest is already running for this data source")

        run = HarvestRun(
            harvest_run_id=uuid4(),
            data_source_id=source.data_source_id,
            tenant_id=actor.tenant_id,
            scope=scope or HarvestScope(),
            budget=budget or HarvestBudget(),
        )
        await self._runs.add(run)
        return to_status(run)

    async def run_harvest(
        self, actor: AuthenticatedActor, harvest_run_id: UUID
    ) -> HarvestStatus:
        """Execute a started run to completion.

        Separate from ``start_harvest`` so the caller can return ``202`` first
        and do the work afterwards, without the transport deciding how discovery
        is scheduled.
        """
        run = await self._load_run(actor, harvest_run_id)
        source = await self._load_source(actor, run.data_source_id)
        credentials = self._open(source)

        peers = await self._peer_catalogs(actor, exclude=source.data_source_id)
        version = await execute_harvest(
            HarvestDependencies(
                connector=self._connector,
                catalogs=self._catalogs,
                relations=self._relations,
                runs=self._runs,
                clock=self._clock,
            ),
            run=run,
            source=source,
            credentials=credentials,
            peer_catalogs=peers,
        )
        if version is not None:
            source.mark_harvested(at=self._clock.now())
            await self._sources.save(source)
        return to_status(run)

    async def get_harvest(
        self, actor: AuthenticatedActor, harvest_run_id: UUID
    ) -> HarvestStatus:
        run = await self._load_run(actor, harvest_run_id)
        unreadable: tuple[tuple[str, str], ...] = ()
        if run.catalog_version_id is not None:
            version = await self._catalogs.get_version(
                run.catalog_version_id, tenant_id=actor.tenant_id
            )
            if version is not None:
                unreadable = tuple(
                    (u.qualified_name, u.reason) for u in version.unreadable
                )
        return to_status(run, unreadable=unreadable)

    async def cancel_harvest(
        self, actor: AuthenticatedActor, harvest_run_id: UUID
    ) -> HarvestStatus:
        self._require(actor, HARVEST_ROLES)
        run = await self._load_run(actor, harvest_run_id)
        if run.is_terminal:
            raise ConflictError("Harvest run has already finished")
        run.request_cancellation()
        await self._runs.save(run)
        return to_status(run)

    async def list_harvests(
        self, actor: AuthenticatedActor, data_source_id: UUID
    ) -> tuple[HarvestStatus, ...]:
        await self._load_source(actor, data_source_id)
        runs = await self._runs.list_for_source(
            data_source_id, tenant_id=actor.tenant_id
        )
        return tuple(to_status(r) for r in runs)

    # ---------------------------------------------------------------- catalog

    async def latest_catalog(
        self, actor: AuthenticatedActor, data_source_id: UUID
    ) -> CatalogVersion:
        await self._load_source(actor, data_source_id)
        version = await self._catalogs.latest_version(
            data_source_id, tenant_id=actor.tenant_id
        )
        if version is None:
            raise CatalogVersionNotFoundError(str(data_source_id))
        return version

    async def get_catalog(
        self, actor: AuthenticatedActor, catalog_version_id: UUID
    ) -> CatalogVersion:
        version = await self._catalogs.get_version(
            catalog_version_id, tenant_id=actor.tenant_id
        )
        if version is None:
            raise CatalogVersionNotFoundError(str(catalog_version_id))
        return version

    async def search_catalog(
        self, actor: AuthenticatedActor, catalog_version_id: UUID, term: str
    ) -> tuple[str, ...]:
        version = await self.get_catalog(actor, catalog_version_id)
        return tuple(
            table.name if source_field is None else f"{table.name}.{source_field.name}"
            for table, source_field in version.search(term)
        )

    async def diff_catalog(
        self,
        actor: AuthenticatedActor,
        *,
        previous_id: UUID,
        current_id: UUID,
    ) -> ReharvestReport:
        previous = await self.get_catalog(actor, previous_id)
        current = await self.get_catalog(actor, current_id)
        diff = diff_catalogs(previous, current)
        relations = await self._relations.list_for_version(
            current_id, tenant_id=actor.tenant_id
        )
        return ReharvestReport(
            catalog_version_id=current_id,
            carried_forward=sum(
                1 for r in relations if r.state is RelationState.CONFIRMED
            ),
            staled=sum(1 for r in relations if r.state is RelationState.STALE),
            added_fields=len(diff.added),
            removed_fields=len(diff.removed),
            type_changed_fields=len(diff.type_changed),
        )

    # -------------------------------------------------------------- relations

    async def list_relations(
        self,
        actor: AuthenticatedActor,
        catalog_version_id: UUID,
        *,
        state: RelationState | None = None,
    ) -> tuple[RelationView, ...]:
        relations = await self._relations.list_for_version(
            catalog_version_id, tenant_id=actor.tenant_id
        )
        selected = [r for r in relations if state is None or r.state is state]
        selected.sort(key=lambda r: r.confidence, reverse=True)
        return tuple(to_relation_view(r) for r in selected)

    async def confirm_relation(
        self, actor: AuthenticatedActor, relation_id: UUID
    ) -> RelationView:
        self._require(actor, WRITE_ROLES)
        relation = await self._load_relation(actor, relation_id)
        try:
            relation.confirm(actor_id=actor.user_id, at=self._clock.now())
        except RelationTransitionError as exc:
            raise ConflictError(str(exc)) from exc
        await self._relations.save(relation)
        return to_relation_view(relation)

    async def reject_relation(
        self,
        actor: AuthenticatedActor,
        relation_id: UUID,
        *,
        reason: RejectionReason,
    ) -> RelationView:
        self._require(actor, WRITE_ROLES)
        relation = await self._load_relation(actor, relation_id)
        try:
            relation.reject(
                actor_id=actor.user_id, reason=reason, at=self._clock.now()
            )
        except RelationTransitionError as exc:
            raise ConflictError(str(exc)) from exc
        await self._relations.save(relation)
        return to_relation_view(relation)

    async def revoke_relation(
        self, actor: AuthenticatedActor, relation_id: UUID
    ) -> RelationView:
        self._require(actor, WRITE_ROLES)
        relation = await self._load_relation(actor, relation_id)
        try:
            relation.revoke(actor_id=actor.user_id, at=self._clock.now())
        except RelationTransitionError as exc:
            raise ConflictError(str(exc)) from exc
        await self._relations.save(relation)
        return to_relation_view(relation)

    async def declare_relation(
        self,
        actor: AuthenticatedActor,
        *,
        catalog_version_id: UUID,
        left_field_id: UUID,
        right_field_id: UUID,
    ) -> RelationView:
        """Record a join only the Tenant knows about — after checking it holds.

        Validated against real data rather than taken on trust. The reviewer's
        own typo is as capable of producing a wrong Finding as the system's own
        guess, and the confirmation ceremony would be theatre if a declared
        Relation skipped it.
        """
        self._require(actor, WRITE_ROLES)
        version = await self.get_catalog(actor, catalog_version_id)
        left = version.find_field(left_field_id)
        right = version.find_field(right_field_id)
        if left is None or right is None:
            raise RelationNotFoundError(
                "Both fields must exist in this catalog version"
            )

        left_table, left_field = left
        right_table, right_field = right
        source = await self._sources.get(
            version.data_source_id, tenant_id=actor.tenant_id
        )
        if source is None:
            raise DataSourceNotFoundError(str(version.data_source_id))
        credentials = self._open(source)

        overlap: OverlapMeasurement = await self._connector.measure_overlap(
            credentials,
            credentials,
            left=(left_table.database, left_table.name, left_field.name),
            right=(right_table.database, right_table.name, right_field.name),
            sample_rows=HarvestBudget().sample_rows,
        )
        candidate = CandidatePair(
            left_data_source_id=version.data_source_id,
            left_table=left_table,
            left_field=left_field,
            right_data_source_id=version.data_source_id,
            right_table=right_table,
            right_field=right_field,
            name_affinity=name_affinity(
                left_table.name, left_field.name, right_table.name, right_field.name
            ),
        )
        scored = score_candidate(candidate, overlap)
        if scored is None:
            raise ConflictError(
                "The declared fields do not share enough values to be a join"
            )

        now = self._clock.now()
        relation = Relation(
            relation_id=uuid4(),
            tenant_id=actor.tenant_id,
            catalog_version_id=catalog_version_id,
            left_field_id=left_field_id,
            right_field_id=right_field_id,
            left_identity=left_field.identity(left_table.name),
            right_identity=right_field.identity(right_table.name),
            left_data_source_id=version.data_source_id,
            right_data_source_id=version.data_source_id,
            state=RelationState.PROPOSED,
            origin=RelationOrigin.DECLARED,
            confidence=scored.confidence,
            binding_ceiling=BindingCeiling(scored.binding_ceiling),
            cardinality=infer_cardinality(overlap),
            evidence=scored.evidence,
            created_at=now,
        )
        relation.confirm(actor_id=actor.user_id, at=now)
        await self._relations.add_many([relation])
        return to_relation_view(relation)

    async def join_graph(
        self, actor: AuthenticatedActor, catalog_version_id: UUID
    ) -> JoinGraphView:
        """The confirmed Relations, and the fields nothing connects to.

        The isolated-field list is not decoration. It is the difference between
        "your data connects" and "half of it is unreachable and nobody said so".
        """
        version = await self.get_catalog(actor, catalog_version_id)
        relations = await self._relations.list_for_version(
            catalog_version_id, tenant_id=actor.tenant_id
        )
        graph = JoinGraph.build(catalog_version_id, tuple(relations))

        all_ids = frozenset(
            f.field_id for table in version.tables for f in table.fields
        )
        isolated = graph.isolated_field_ids(all_ids)
        names = tuple(
            f"{table.name}.{source_field.name}"
            for table in version.tables
            for source_field in table.fields
            if source_field.field_id in isolated
        )
        return JoinGraphView(
            catalog_version_id=catalog_version_id,
            relations=tuple(to_relation_view(r) for r in graph.relations),
            isolated_fields=names,
        )

    async def permits_join(
        self,
        actor: AuthenticatedActor,
        *,
        catalog_version_id: UUID,
        left_field_id: UUID,
        right_field_id: UUID,
    ) -> bool:
        """Whether an agent may join these two fields.

        The enforcement point for the whole design. An agent asks; it does not
        assert.
        """
        relations = await self._relations.list_for_version(
            catalog_version_id, tenant_id=actor.tenant_id
        )
        graph = JoinGraph.build(catalog_version_id, tuple(relations))
        return graph.permits(left_field_id, right_field_id)

    # ---------------------------------------------------------------- uploads

    async def preview_upload(
        self,
        actor: AuthenticatedActor,
        *,
        filename: str,
        upload_format: UploadFormat,
        stream: AsyncIterator[bytes],
        preview_rows: int = 20,
    ) -> UploadPreview:
        """Parse a file and show what it looks like, without committing to it.

        Preview before commit exists because a mis-parsed column discovered
        afterwards has already poisoned every profile and every Relation
        downstream of it.
        """
        self._require(actor, HARVEST_ROLES)
        buffered = bytearray()
        async for chunk in stream:
            buffered.extend(chunk)
            if len(buffered) > MAX_UPLOAD_BYTES:
                raise UploadRejectedError(
                    f"Upload exceeds the {MAX_UPLOAD_BYTES} byte limit"
                )

        columns, rows, total = await self._landing.inspect(
            _replay(bytes(buffered)),
            upload_format=upload_format,
            preview_rows=preview_rows,
        )
        preview = UploadPreview(
            upload_id=uuid4(),
            filename=filename,
            upload_format=upload_format,
            columns=tuple(columns),
            rows=tuple(tuple(r) for r in rows),
            total_bytes=len(buffered),
            truncated=total > preview_rows,
        )
        self._pending_uploads[preview.upload_id] = (preview, bytes(buffered))
        return preview

    async def commit_upload(
        self,
        actor: AuthenticatedActor,
        upload_id: UUID,
        *,
        name: str,
        columns: Sequence[object] | None = None,
    ) -> SourceSummary:
        """Land a previewed file and turn it into a Data Source.

        The result is an ordinary Data Source of kind ``uploaded``, not a
        parallel concept — which is what lets it be harvested, profiled and
        relation-inferred by exactly the same code as a connected warehouse, and
        what makes a join between it and that warehouse discoverable at all.
        """
        self._require(actor, HARVEST_ROLES)
        pending = self._pending_uploads.pop(upload_id, None)
        if pending is None:
            raise UploadRejectedError("No pending upload with that id")

        preview, payload = pending
        chosen = tuple(columns) if columns else preview.columns
        landed = await self._landing.land(
            _replay(payload),
            tenant_id=actor.tenant_id,
            upload_id=upload_id,
            upload_format=preview.upload_format,
            columns=chosen,  # type: ignore[arg-type]
        )
        now = self._clock.now()
        source = DataSource(
            data_source_id=uuid4(),
            tenant_id=actor.tenant_id,
            name=name,
            kind=SourceKind.UPLOADED,
            description=f"Uploaded from {preview.filename}",
            health=SourceHealth.REACHABLE,
            last_verified_at=now,
            created_at=now,
            landed_table=landed.qualified_name,
            metadata={"rows": str(landed.row_count), "filename": preview.filename},
        )
        await self._sources.add(source)
        return to_summary(source)

    # ---------------------------------------------------------------- helpers

    def _require(self, actor: AuthenticatedActor, allowed: frozenset) -> None:
        if actor.role not in allowed:
            raise PermissionDeniedError(
                f"Role {actor.role} may not perform this action"
            )

    def _open(self, source: DataSource) -> SourceCredentials:
        if source.kind is SourceKind.UPLOADED:
            database, _, table = (source.landed_table or ".").partition(".")
            from .dto import LandedTable

            return self._landing.credentials_for(
                LandedTable(database=database, table=table, row_count=0)
            )
        if source.sealed_credentials is None:
            raise DataSourceNotFoundError("Data source has no stored credentials")
        return self._cipher.open(source.sealed_credentials)

    async def _load_source(
        self, actor: AuthenticatedActor, data_source_id: UUID
    ) -> DataSource:
        source = await self._sources.get(data_source_id, tenant_id=actor.tenant_id)
        if source is None:
            raise DataSourceNotFoundError(str(data_source_id))
        return source

    async def _load_run(
        self, actor: AuthenticatedActor, harvest_run_id: UUID
    ) -> HarvestRun:
        run = await self._runs.get(harvest_run_id, tenant_id=actor.tenant_id)
        if run is None:
            raise HarvestRunNotFoundError(str(harvest_run_id))
        return run

    async def _load_relation(
        self, actor: AuthenticatedActor, relation_id: UUID
    ) -> Relation:
        relation = await self._relations.get(relation_id, tenant_id=actor.tenant_id)
        if relation is None:
            raise RelationNotFoundError(str(relation_id))
        return relation

    async def _peer_catalogs(
        self, actor: AuthenticatedActor, *, exclude: UUID
    ) -> tuple[tuple[UUID, CatalogVersion, SourceCredentials], ...]:
        """The other sources' latest catalogs, so inference can span them."""
        peers: list[tuple[UUID, CatalogVersion, SourceCredentials]] = []
        for other in await self._sources.list(tenant_id=actor.tenant_id):
            if other.data_source_id == exclude:
                continue
            version = await self._catalogs.latest_version(
                other.data_source_id, tenant_id=actor.tenant_id
            )
            if version is None:
                continue
            peers.append((other.data_source_id, version, self._open(other)))
        return tuple(peers)


async def _replay(payload: bytes) -> AsyncIterator[bytes]:
    yield payload
