from __future__ import annotations

from uuid import UUID

import pytest

from zentra_adapter_langgraph.checkpoints import _tenant_id

TENANT_ID = UUID("20000000-0000-0000-0000-000000000002")
INVESTIGATION_ID = UUID("30000000-0000-0000-0000-000000000003")


def test_checkpoint_config_requires_and_extracts_tenant_scope() -> None:
    config = {
        "configurable": {
            "thread_id": f"{TENANT_ID}:{INVESTIGATION_ID}",
        }
    }

    assert _tenant_id(config) == TENANT_ID


@pytest.mark.parametrize(
    "thread_id",
    ["", str(INVESTIGATION_ID), f"not-a-uuid:{INVESTIGATION_ID}"],
)
def test_checkpoint_config_rejects_unscoped_identifiers(thread_id: str) -> None:
    with pytest.raises(ValueError, match="Checkpoint thread ID"):
        _tenant_id({"configurable": {"thread_id": thread_id}})
