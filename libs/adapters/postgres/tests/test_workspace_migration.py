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


def test_workspace_migration_is_additive_and_installs_forced_rls() -> None:
    # Projects were additive here originally but are dropped by the later
    # destructive Chat & Analysis Run cutover (ADR-0028, ADR-0030) -- this
    # test now only covers Groups, which that cutover leaves untouched.
    #
    # No longer downgrades to a pre-cutover revision first: the cutover's
    # own downgrade cannot walk further back than itself (recreating
    # `analysis_runs`' pre-cutover shape, which several migrations between
    # here and there reference by name, would mean reversing the whole
    # chain just to prove Groups are still additive -- a property this test
    # can verify directly at head instead).
    assert OWNER_URL is not None
    os.environ["DATABASE_OWNER_URL"] = OWNER_URL
    config = _config()
    engine = create_engine(OWNER_URL)
    try:
        command.upgrade(config, "head")

        assert "workspace_groups" in set(inspect(engine).get_table_names())
        with engine.begin() as connection:
            rls = connection.execute(
                text(
                    "SELECT relname, relrowsecurity, relforcerowsecurity "
                    "FROM pg_class WHERE relname = 'workspace_groups'"
                )
            ).all()
            policies = connection.execute(
                text(
                    "SELECT tablename, policyname FROM pg_policies "
                    "WHERE tablename = 'workspace_groups'"
                )
            ).all()

        assert len(rls) == 1
        assert all(row.relrowsecurity and row.relforcerowsecurity for row in rls)
        assert {(row.tablename, row.policyname) for row in policies} == {
            ("workspace_groups", "workspace_groups_tenant_isolation"),
        }
    finally:
        command.upgrade(config, "head")
        engine.dispose()
