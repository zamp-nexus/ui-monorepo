from zentra_adapter_postgres.schema import agent_registry, metadata


def test_phase_zero_tables_are_present_and_registry_is_schema_only() -> None:
    assert {
        "tenants",
        "users",
        "identity_subjects",
        "tenant_identity_bindings",
        "tenant_memberships",
        "investigations",
        "agent_executions",
        "human_approvals",
        "semantic_metrics",
        "agent_registry",
    } == set(metadata.tables)
    assert agent_registry.c.enabled.server_default.arg.text == "false"
