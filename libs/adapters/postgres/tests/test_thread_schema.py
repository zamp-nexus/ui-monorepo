from sqlalchemy import CheckConstraint, UniqueConstraint

from zentra_adapter_postgres.schema import (
    analysis_runs,
    chat_sessions,
    messages,
)


def test_thread_tables_have_tenant_hierarchy_and_immutable_message_shape() -> None:
    session_foreign_keys = {
        tuple(element.target_fullname for element in constraint.elements)
        for constraint in chat_sessions.foreign_key_constraints
    }
    message_foreign_keys = {
        tuple(element.target_fullname for element in constraint.elements)
        for constraint in messages.foreign_key_constraints
    }

    assert (
        "workspace_groups.group_id",
        "workspace_groups.organization_id",
    ) in session_foreign_keys
    assert (
        "chat_sessions.chat_session_id",
        "chat_sessions.organization_id",
    ) in message_foreign_keys
    assert "updated_at" not in messages.c


def test_thread_message_and_title_bounds_are_database_invariants() -> None:
    checks = {
        constraint.name
        for table in (chat_sessions, messages)
        for constraint in table.constraints
        if isinstance(constraint, CheckConstraint)
    }

    assert "ck_chat_sessions_title_length" in checks
    assert "ck_messages_content_length" in checks
    assert "ck_messages_kind" in checks


def test_chat_sessions_have_a_nullable_source_scope() -> None:
    session_foreign_keys = {
        tuple(element.target_fullname for element in constraint.elements)
        for constraint in chat_sessions.foreign_key_constraints
    }

    assert chat_sessions.c.source_scope_id.nullable is True
    assert (
        "analysis_source_scopes.source_scope_id",
    ) in session_foreign_keys


def test_analysis_runs_link_to_one_message_and_sequence_in_a_thread() -> None:
    uniques = {
        constraint.name
        for constraint in analysis_runs.constraints
        if isinstance(constraint, UniqueConstraint)
    }
    foreign_keys = {
        constraint.name for constraint in analysis_runs.foreign_key_constraints
    }

    assert "uq_analysis_runs_chat_sequence" in uniques
    assert "fk_analysis_runs_chat_session_organization" in foreign_keys
    assert "fk_analysis_runs_initiating_message" in foreign_keys
