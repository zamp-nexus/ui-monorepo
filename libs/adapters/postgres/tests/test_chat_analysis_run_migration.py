from __future__ import annotations

import os
from pathlib import Path

import pytest
from alembic import command
from alembic.config import Config
from sqlalchemy import create_engine, inspect, text

OWNER_URL = os.getenv("TEST_DATABASE_OWNER_URL")
pytestmark = pytest.mark.skipif(
    not OWNER_URL,
    reason="local Postgres integration URL is not configured",
)

OLD_TABLES = (
    "projects",
    "investigation_threads",
    "thread_messages",
    "investigations",
    "thread_events",
    "investigation_boards",
)
NEW_TABLES = (
    "chat_sessions",
    "messages",
    "analysis_runs",
    "activity_events",
    "analysis_workspaces",
)
RLS_CHECKED_TABLES = (
    *NEW_TABLES,
    "agent_executions",
    "human_approvals",
    "audit_outbox",
    "work_items",
    "execution_jobs",
    "board_facts",
    "board_hypotheses",
    "board_gaps",
    "board_conflicts",
    "visualization_briefs",
    "visualization_artifacts",
    "visualization_actions",
)


def _config() -> Config:
    root = Path(__file__).resolve().parents[1]
    config = Config(str(root / "alembic.ini"))
    config.set_main_option("script_location", str(root / "migrations"))
    return config


def test_chat_analysis_run_cutover_drops_old_tables_and_creates_new_ones() -> None:
    assert OWNER_URL is not None
    os.environ["DATABASE_OWNER_URL"] = OWNER_URL
    config = _config()
    engine = create_engine(OWNER_URL)
    try:
        command.upgrade(config, "head")
        table_names = set(inspect(engine).get_table_names())

        assert not (set(OLD_TABLES) & table_names), (
            f"old tables still present: {set(OLD_TABLES) & table_names}"
        )
        assert set(NEW_TABLES) <= table_names

        with engine.begin() as connection:
            rls = connection.execute(
                text(
                    "SELECT relname, relrowsecurity, relforcerowsecurity "
                    "FROM pg_class WHERE relname = ANY(:names)"
                ),
                {"names": list(RLS_CHECKED_TABLES)},
            ).all()
            policies = connection.execute(
                text(
                    "SELECT tablename, policyname FROM pg_policies "
                    "WHERE tablename = ANY(:names)"
                ),
                {"names": list(RLS_CHECKED_TABLES)},
            ).all()

        assert len(rls) == len(RLS_CHECKED_TABLES)
        assert all(row.relrowsecurity and row.relforcerowsecurity for row in rls)
        assert {(row.tablename, row.policyname) for row in policies} == {
            (name, f"{name}_tenant_isolation") for name in RLS_CHECKED_TABLES
        }
    finally:
        engine.dispose()
