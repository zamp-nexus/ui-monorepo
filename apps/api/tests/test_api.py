from dataclasses import dataclass
from uuid import UUID

from fastapi.testclient import TestClient
from zentra_adapter_postgres import IdentityContext, IdentityNotBoundError

from zentra_api.auth import AuthenticationError, ClerkPrincipal
from zentra_api.main import create_app
from zentra_api.settings import Settings


class Probe:
    def __init__(self, healthy: bool) -> None:
        self.healthy = healthy

    async def health(self) -> bool:
        return self.healthy


class Verifier:
    async def verify(self, token: str) -> ClerkPrincipal:
        if token != "valid":
            raise AuthenticationError("Invalid bearer token")
        return ClerkPrincipal(subject_id="user_123", organization_id="org_123")


class Engine:
    class Transaction:
        async def __aenter__(self) -> object:
            return object()

        async def __aexit__(self, *args: object) -> None:
            return None

    def begin(self) -> Transaction:
        return self.Transaction()


@dataclass
class DatabaseProbe(Probe):
    engine: Engine

    def __init__(self, healthy: bool) -> None:
        super().__init__(healthy)
        self.engine = Engine()


@dataclass
class Dependencies:
    database: DatabaseProbe
    audit: Probe
    cube: Probe
    jwt_verifier: Verifier

    async def close(self) -> None:
        return None


def client(
    *, postgres: bool = True, clickhouse: bool = True, cube: bool = True
) -> TestClient:
    dependencies = Dependencies(
        database=DatabaseProbe(postgres),
        audit=Probe(clickhouse),
        cube=Probe(cube),
        jwt_verifier=Verifier(),
    )
    app = create_app(
        Settings(clerk_issuer="https://example.clerk.accounts.dev"),
        dependencies=dependencies,  # type: ignore[arg-type]
    )
    return TestClient(app)


def test_liveness_never_contacts_dependencies() -> None:
    with client(postgres=False, clickhouse=False, cube=False) as test_client:
        response = test_client.get("/health/live")

    assert response.status_code == 200
    assert response.json() == {"status": "live"}


def test_readiness_reports_sanitized_dependency_state() -> None:
    with client(clickhouse=False) as test_client:
        response = test_client.get("/health/ready")

    assert response.status_code == 503
    assert response.json()["dependencies"] == {
        "postgres": {"status": "ready"},
        "clickhouse": {"status": "unavailable"},
        "cube": {"status": "ready"},
    }
    assert "password" not in response.text


def test_context_requires_bearer_token() -> None:
    with client() as test_client:
        response = test_client.get("/v1/context")

    assert response.status_code == 401
    assert response.json()["detail"] == "Bearer token is required"


def test_context_rejects_invalid_bearer_token() -> None:
    with client() as test_client:
        response = test_client.get(
            "/v1/context",
            headers={"Authorization": "Bearer invalid"},
        )

    assert response.status_code == 401
    assert response.json()["detail"] == "Invalid bearer token"


def test_context_returns_internal_identity(monkeypatch) -> None:
    expected = IdentityContext(
        user_id=UUID("10000000-0000-0000-0000-000000000001"),
        tenant_id=UUID("20000000-0000-0000-0000-000000000002"),
        email="owner@example.com",
        tenant_name="Acme Europe",
        role="owner",
    )

    async def resolve(*args: object, **kwargs: object) -> IdentityContext:
        return expected

    correlated_tenants = []
    monkeypatch.setattr("zentra_api.routes.resolve_identity_context", resolve)
    monkeypatch.setattr(
        "zentra_api.routes.correlate_tenant",
        correlated_tenants.append,
    )

    with client() as test_client:
        response = test_client.get(
            "/v1/context",
            headers={
                "Authorization": "Bearer valid",
                "Traceparent": (
                    "00-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-01"
                ),
            },
        )

    assert response.status_code == 200
    assert response.json() == {
        "user_id": str(expected.user_id),
        "tenant_id": str(expected.tenant_id),
        "email": expected.email,
        "tenant_name": expected.tenant_name,
        "role": expected.role,
    }
    assert correlated_tenants == [expected.tenant_id]


def test_context_denies_unbound_organization(monkeypatch) -> None:
    async def resolve(*args: object, **kwargs: object) -> IdentityContext:
        raise IdentityNotBoundError("Identity organization is not bound to a tenant")

    monkeypatch.setattr("zentra_api.routes.resolve_identity_context", resolve)

    with client() as test_client:
        response = test_client.get(
            "/v1/context",
            headers={"Authorization": "Bearer valid"},
        )

    assert response.status_code == 403
    assert response.json()["detail"] == "Identity organization is not bound to a tenant"
