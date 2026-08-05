from zentra_adapter_postgres.schema import agent_registry, metadata


def test_phase_zero_tables_are_present_and_registry_is_schema_only() -> None:
    assert {
        "organizations",
        "users",
        "identity_subjects",
        "organization_identity_bindings",
        "organization_memberships",
        "analysis_source_scopes",
        "analysis_source_scope_members",
        "analysis_runs",
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
        # Phase 3 connector: a registered Data Source and its sealed
        # credential, plus what a harvest learned and what a reviewer decided.
        "data_sources",
        "catalog_versions",
        "relations",
        "harvest_runs",
        "catalog_agent_access",
        "workspace_groups",
        "chat_sessions",
        "messages",
        "activity_events",
        "execution_jobs",
        "visualization_briefs",
        "visualization_artifacts",
        "visualization_actions",
        # The Analysis Run's working memory: what it has established, what it
        # still does not know, and the queue it works off (ADR-0026). Migration
        # 0020, renamed from AnalysisRun Board per ADR-0028.
        "analysis_workspaces",
        "board_facts",
        "board_hypotheses",
        "board_gaps",
        "board_conflicts",
        "work_items",
        # Per-Tenant narrowing of the governed catalog (ADR-0027). The table
        # exists; nothing writes it yet, so every Tenant reads the whole
        # catalog.
        "analytical_scopes",
        # Sequence: a Dataset Workspace-owned graph of typed transform steps.
        "sequences",
        "sequence_steps",
        "prepared_tables",
        "sequence_runs",
        "sequence_final_tables",
    } == set(metadata.tables)
    assert agent_registry.c.enabled.server_default.arg.text == "false"
