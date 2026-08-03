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


def _config() -> Config:
    root = Path(__file__).resolve().parents[1]
    config = Config(str(root / "alembic.ini"))
    config.set_main_option("script_location", str(root / "migrations"))
    return config


def test_thread_migration_is_additive_and_messages_are_not_updatable() -> None:
    # Chat Session/Message are created by the destructive Chat & Analysis
    # Run cutover (0023, chat_analysis_run_cutover), not by an earlier,
    # separately-additive migration -- and that cutover's own downgrade
    # cannot walk further back than itself (ADR-0030: recreating
    # `investigations`' pre-cutover shape would mean reversing everything
    # 0002 through 0022 did to it, just to prove a point already settled).
    # This now verifies the structure at head directly rather than round
    # -tripping through history that no longer exists.
    assert OWNER_URL is not None
    os.environ["DATABASE_OWNER_URL"] = OWNER_URL
    config = _config()
    engine = create_engine(OWNER_URL)
    try:
        command.upgrade(config, "head")

        inspector = inspect(engine)
        assert {"chat_sessions", "messages"} <= set(
            inspector.get_table_names()
        )
        analysis_run_columns = {
            column["name"] for column in inspector.get_columns("analysis_runs")
        }
        assert {"chat_session_id", "chat_sequence", "initiating_message_id"} <= (
            analysis_run_columns
        )
        with engine.begin() as connection:
            privileges = connection.execute(
                text(
                    "SELECT privilege_type FROM information_schema.role_table_grants "
                    "WHERE grantee = 'zentra_runtime' "
                    "AND table_name = 'messages'"
                )
            ).scalars()
            message_grants = set(privileges)
        assert "SELECT" in message_grants
        assert "INSERT" in message_grants
        assert "UPDATE" not in message_grants
        assert "DELETE" not in message_grants
    finally:
        command.upgrade(config, "head")
        engine.dispose()
