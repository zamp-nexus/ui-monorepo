from zentra_adapter_postgres.schema import (
    activity_events,
    visualization_actions,
    visualization_artifacts,
    visualization_briefs,
)


def _foreign_key_names(table: object) -> set[str]:
    return {value.name for value in table.foreign_key_constraints}


def test_chat_tables_use_tenant_scoped_foreign_keys_and_retry_lineage() -> None:
    assert "fk_activity_events_chat_session_tenant" in _foreign_key_names(
        activity_events
    )
    assert {
        "fk_visualization_artifacts_brief_tenant",
        "fk_visualization_artifacts_analysis_run_tenant",
        "fk_visualization_artifacts_retry_tenant",
    } <= _foreign_key_names(visualization_artifacts)
    assert {
        "fk_visualization_actions_artifact_tenant",
        "fk_visualization_actions_chat_session_tenant",
        "fk_visualization_actions_analysis_run_tenant",
    } <= _foreign_key_names(visualization_actions)
    assert "fk_visualization_briefs_analysis_run_tenant" in _foreign_key_names(
        visualization_briefs
    )


def test_visualization_content_is_nullable_for_transactional_erasure() -> None:
    assert visualization_briefs.c.content.nullable
    assert visualization_artifacts.c.c1_response.nullable
    assert {"erased_at", "erasure_category"} <= set(visualization_artifacts.c.keys())
