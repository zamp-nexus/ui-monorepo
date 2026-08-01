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
        "audit_outbox",
        # Phase 2, added beside the Phase 1 narrative Finding rather than
        # replacing it.
        "draft_findings",
        "draft_finding_claims",
        "evidence_citations",
        "draft_finding_claim_citations",
        "erasure_operations",
        "workspace_groups",
        "projects",
    } == set(metadata.tables)
    assert agent_registry.c.enabled.server_default.arg.text == "false"
