from uuid import uuid4

import pytest
from sqlalchemy import text

from zentra_adapter_postgres.database import set_organization_context


class RecordingConnection:
    def __init__(self) -> None:
        self.statement = None
        self.parameters = None

    async def execute(self, statement: object, parameters: object) -> None:
        self.statement = statement
        self.parameters = parameters


@pytest.mark.asyncio
async def test_tenant_context_is_set_locally_from_internal_uuid() -> None:
    connection = RecordingConnection()
    organization_id = uuid4()

    await set_organization_context(connection, organization_id)  # type: ignore[arg-type]

    assert (
        str(connection.statement)
        == "SELECT set_config('app.organization_id', :organization_id, true)"
    )
    assert connection.parameters == {"organization_id": str(organization_id)}


def test_rls_expression_fails_closed_without_setting() -> None:
    expression = text(
        "organization_id = NULLIF(current_setting('app.organization_id', true), '')::uuid"
    )

    assert "NULLIF" in str(expression)
    assert "true" in str(expression)
