"""Request-level tests for the Sequence API.

`test_zentraos_contract.py` asserts the committed OpenAPI document matches
what the application generates; it never calls a handler. These go through
the router: real request, real authorisation, real `SequenceService`, an
in-memory repository — the same shape `test_connector_api.py` uses.

Storage itself is covered against Postgres in
`libs/adapters/postgres/tests/test_sequence_integration.py`.
"""

from __future__ import annotations

from contextlib import AbstractAsyncContextManager
from dataclasses import dataclass
from datetime import UTC, datetime
from uuid import UUID, uuid4

from fastapi.testclient import TestClient
from zentra_adapter_postgres import IdentityContext
from zentra_application_sequence import (
    RawTableResolver,
    SequenceListItem,
    SequenceOrigin,
    SequenceService,
    dataset_workspace_id_for,
    raw_table_label,
)
from zentra_domain_sequence import (
    ConnectorSourceTableReference,
    RawTableReference,
    Sequence,
)

from zentra_api.auth import AuthenticationError, ClerkPrincipal
from zentra_api.main import create_app
from zentra_api.settings import Settings

OWNER = IdentityContext(
    user_id=UUID("10000000-0000-0000-0000-000000000001"),
    organization_id=UUID("20000000-0000-0000-0000-000000000002"),
    email="owner@example.com",
    organization_name="Acme Europe",
    role="owner",
)
OTHER_TENANT = IdentityContext(
    user_id=UUID("10000000-0000-0000-0000-000000000009"),
    organization_id=UUID("20000000-0000-0000-0000-000000000008"),
    email="stranger@example.com",
    organization_name="Other Co",
    role="owner",
)
AUTH = {"Authorization": "Bearer valid"}
NOW = datetime(2026, 8, 1, tzinfo=UTC)


class Probe:
    def __init__(self, healthy: bool = True) -> None:
        self.healthy = healthy

    async def health(self) -> bool:
        return self.healthy


class Engine:
    class Transaction:
        async def __aenter__(self) -> object:
            return object()

        async def __aexit__(self, *args: object) -> None:
            return None

    def begin(self) -> Transaction:
        return self.Transaction()


class DatabaseProbe(Probe):
    def __init__(self, healthy: bool = True) -> None:
        super().__init__(healthy)
        self.engine = Engine()


class Verifier:
    async def verify(self, token: str) -> ClerkPrincipal:
        if token != "valid":
            raise AuthenticationError("Invalid bearer token")
        return ClerkPrincipal(subject_id="user_123", organization_id="org_123")


class FakeSequenceRepository:
    def __init__(self) -> None:
        self.sequences: dict[UUID, Sequence] = {}

    async def add_sequence(self, sequence: Sequence) -> None:
        self.sequences[sequence.sequence_id] = sequence

    async def get_sequence(self, sequence_id: UUID, *, for_update: bool = False):
        del for_update
        return self.sequences.get(sequence_id)

    async def list_sequences(
        self, *, organization_id: UUID, dataset_workspace_id: UUID
    ) -> tuple[SequenceListItem, ...]:
        matches = [
            s
            for s in self.sequences.values()
            if s.organization_id == organization_id
            and s.dataset_workspace_id == dataset_workspace_id
        ]
        matches.sort(key=lambda s: (s.updated_at, s.sequence_id), reverse=True)
        return tuple(
            SequenceListItem(
                sequence_id=s.sequence_id,
                thread_id=s.thread_id,
                origin=(
                    SequenceOrigin.MANUAL
                    if s.thread_id is not None
                    else SequenceOrigin.CHAT
                ),
                raw_table=s.raw_table_reference,
                raw_table_label=raw_table_label(s.raw_table_reference),
                step_count=len(s.steps),
                final_table_count=len(s.final_table_ids),
                failed_run_count=0,
                created_at=s.created_at,
                updated_at=s.updated_at,
            )
            for s in matches
        )


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


class AlwaysResolvesRawTable(RawTableResolver):
    async def label(self, organization_id: UUID, reference: RawTableReference) -> str | None:
        del organization_id
        return raw_table_label(reference)


class NeverResolvesRawTable(RawTableResolver):
    async def label(self, organization_id: UUID, reference: RawTableReference) -> str | None:
        del organization_id, reference
        return None


@dataclass
class ThreadDetailStub:
    thread_id: UUID


class ThreadsStub:
    """Just enough of `ThreadService` for the manual-create flow: `create`."""

    def __init__(self) -> None:
        self.created_for_projects: list[UUID] = []

    async def create(
        self, actor, *, project_id: UUID, content: str
    ) -> ThreadDetailStub:
        del actor, content
        self.created_for_projects.append(project_id)
        return ThreadDetailStub(thread_id=uuid4())


@dataclass
class Dependencies:
    database: DatabaseProbe
    audit: Probe
    cube: Probe
    jwt_verifier: Verifier
    sequences: SequenceService | None
    threads: object | None = None

    async def close(self) -> None:
        return None


def build(
    monkeypatch,
    *,
    identity: IdentityContext = OWNER,
    repository: FakeSequenceRepository | None = None,
    sequence_configured: bool = True,
    raw_tables: RawTableResolver | None = None,
    threads: object | None = None,
) -> tuple[TestClient, FakeSequenceRepository]:
    async def resolve(*args: object, **kwargs: object) -> IdentityContext:
        return identity

    monkeypatch.setattr("zentra_api.request_context.resolve_identity_context", resolve)
    monkeypatch.setattr(
        "zentra_api.request_context.correlate_organization", lambda *_: None
    )

    repository = repository if repository is not None else FakeSequenceRepository()
    service = (
        SequenceService(
            unit_of_work_factory=FakeSequenceUnitOfWorkFactory(repository),
            raw_tables=raw_tables or AlwaysResolvesRawTable(),
            now=lambda: NOW,
            new_id=uuid4,
        )
        if sequence_configured
        else None
    )
    app = create_app(
        Settings(clerk_issuer="https://example.clerk.accounts.dev"),
        dependencies=Dependencies(
            database=DatabaseProbe(),
            audit=Probe(),
            cube=Probe(),
            jwt_verifier=Verifier(),
            sequences=service,
            threads=threads if threads is not None else ThreadsStub(),
        ),  # type: ignore[arg-type]
    )
    return TestClient(app), repository


def _seed_sequence(
    repository: FakeSequenceRepository,
    *,
    organization_id: UUID = OWNER.organization_id,
    thread_id: UUID | None = None,
) -> Sequence:
    sequence = Sequence.create(
        sequence_id=uuid4(),
        organization_id=organization_id,
        dataset_workspace_id=dataset_workspace_id_for(organization_id),
        raw_table_reference=ConnectorSourceTableReference(
            catalog_version_id="cv-1", source_table_name="clickathon.orders"
        ),
        now=NOW,
        thread_id=thread_id,
    )
    repository.sequences[sequence.sequence_id] = sequence
    return sequence


def test_listing_requires_authentication() -> None:
    with TestClient(
        create_app(
            Settings(clerk_issuer="https://example.clerk.accounts.dev"),
            dependencies=Dependencies(
                database=DatabaseProbe(),
                audit=Probe(),
                cube=Probe(),
                jwt_verifier=Verifier(),
                sequences=None,
            ),  # type: ignore[arg-type]
        )
    ) as test_client:
        response = test_client.get("/v1/sequences")
    assert response.status_code == 401


def test_listing_returns_503_when_sequence_is_not_configured(monkeypatch) -> None:
    with build(monkeypatch, sequence_configured=False)[0] as test_client:
        response = test_client.get("/v1/sequences", headers=AUTH)
    assert response.status_code == 503


def test_listing_returns_only_this_tenants_sequences(monkeypatch) -> None:
    repository = FakeSequenceRepository()
    mine = _seed_sequence(repository, organization_id=OWNER.organization_id)
    _seed_sequence(repository, organization_id=OTHER_TENANT.organization_id)

    with build(monkeypatch, repository=repository)[0] as test_client:
        response = test_client.get("/v1/sequences", headers=AUTH)

    assert response.status_code == 200
    body = response.json()
    assert [item["sequence_id"] for item in body["items"]] == [str(mine.sequence_id)]
    assert body["items"][0]["raw_table"] == {
        "kind": "connector_source_table",
        "label": "clickathon.orders",
    }


def test_get_returns_the_full_graph(monkeypatch) -> None:
    repository = FakeSequenceRepository()
    sequence = _seed_sequence(repository)

    with build(monkeypatch, repository=repository)[0] as test_client:
        response = test_client.get(
            f"/v1/sequences/{sequence.sequence_id}", headers=AUTH
        )

    assert response.status_code == 200
    body = response.json()
    assert body["sequence_id"] == str(sequence.sequence_id)
    assert body["steps"] == []
    assert body["failed_runs"] == []


def test_get_returns_404_for_an_unknown_sequence(monkeypatch) -> None:
    with build(monkeypatch)[0] as test_client:
        response = test_client.get(f"/v1/sequences/{uuid4()}", headers=AUTH)
    assert response.status_code == 404


def test_get_returns_404_for_another_tenants_sequence(monkeypatch) -> None:
    repository = FakeSequenceRepository()
    theirs = _seed_sequence(repository, organization_id=OTHER_TENANT.organization_id)

    with build(monkeypatch, repository=repository)[0] as test_client:
        response = test_client.get(f"/v1/sequences/{theirs.sequence_id}", headers=AUTH)

    assert response.status_code == 404
    # Not another Tenant's raw table name, and not their sequence id either.
    assert "clickathon" not in response.text


def test_preview_returns_404_for_an_unknown_prepared_table(monkeypatch) -> None:
    repository = FakeSequenceRepository()
    sequence = _seed_sequence(repository)

    with build(monkeypatch, repository=repository)[0] as test_client:
        response = test_client.get(
            f"/v1/sequences/{sequence.sequence_id}/prepared-tables/{uuid4()}",
            headers=AUTH,
        )

    assert response.status_code == 404


def test_create_returns_the_new_sequences_graph_with_its_thread(monkeypatch) -> None:
    client, repository = build(monkeypatch)
    with client as test_client:
        response = test_client.post(
            "/v1/sequences",
            headers=AUTH,
            json={
                "project_id": str(uuid4()),
                "raw_table": {
                    "kind": "connector_source_table",
                    "catalog_version_id": "cv-1",
                    "source_table_name": "clickathon.orders",
                },
                "message": "Clean up this table for modelling.",
            },
        )

    assert response.status_code == 201
    body = response.json()
    assert body["thread_id"] is not None
    assert body["origin"] == "manual"
    stored = repository.sequences[UUID(body["sequence_id"])]
    assert stored.thread_id == UUID(body["thread_id"])


def test_create_rejects_a_raw_table_the_resolver_cannot_find(monkeypatch) -> None:
    with build(monkeypatch, raw_tables=NeverResolvesRawTable())[0] as test_client:
        response = test_client.post(
            "/v1/sequences",
            headers=AUTH,
            json={
                "project_id": str(uuid4()),
                "raw_table": {
                    "kind": "connector_source_table",
                    "catalog_version_id": "cv-1",
                    "source_table_name": "nope.nothere",
                },
                "message": "Clean up this table for modelling.",
            },
        )
    assert response.status_code == 404


def test_a_viewer_cannot_be_blocked_from_reading_sequences(monkeypatch) -> None:
    """Reads are open to any role — only creation and chat writes gate on
    role, and those gate inside `ThreadService`, not here."""
    viewer = IdentityContext(
        user_id=uuid4(),
        organization_id=OWNER.organization_id,
        email="viewer@example.com",
        organization_name="Acme Europe",
        role="viewer",
    )
    with build(monkeypatch, identity=viewer)[0] as test_client:
        response = test_client.get("/v1/sequences", headers=AUTH)
    assert response.status_code == 200
