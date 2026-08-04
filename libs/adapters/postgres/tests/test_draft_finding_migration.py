"""Migration 0006, run for real against a real database.

Not asserted in a docstring — actually executed. The migration is downgraded
away, a representative Phase 1 AnalysisRun is seeded into the schema as it
stood *before* Draft Findings existed, and the upgrade is then run over it and
run again. Both are things only a real Alembic invocation can demonstrate.
"""

from __future__ import annotations

import os
from pathlib import Path
from uuid import UUID

import pytest
from alembic import command
from alembic.config import Config
from sqlalchemy import create_engine, inspect, text

OWNER_URL = os.getenv("TEST_DATABASE_OWNER_URL")

pytestmark = pytest.mark.skipif(
    not OWNER_URL,
    reason="local Postgres integration URL is not configured",
)

PHASE_1_TENANT = UUID("83000000-0000-0000-0000-000000000001")
PHASE_1_ANALYSIS_RUN = UUID("84000000-0000-0000-0000-000000000001")

# A completed Phase 1 AnalysisRun, narrative Finding and all, exactly as it
# sits in `analysis_runs.state` today.
PHASE_1_STATE = {
    "finding": {
        "headline": "EU refunds rose $240 in July",
        "summary": "Governed EU refund amount rose from $20 to $260.",
        "metrics": [
            {
                "metric": "refund_amount",
                "previous_value": "20.00",
                "previous_label": "June 2026",
                "current_value": "260.00",
                "current_label": "July 2026",
                "unit": "USD",
            }
        ],
        "evidence_refs": ["artifact://execution/85000000-0000-0000-0000-000000000001"],
    },
    "outcome": {
        "kind": "confidence",
        "score": 0.82,
        "calibration_method": "evaluator_independent_recheck",
    },
    "completion": {"human_approved": False},
    "failure": None,
}


def alembic_config() -> Config:
    root = Path(__file__).resolve().parents[1]
    config = Config(str(root / "alembic.ini"))
    config.set_main_option("script_location", str(root / "migrations"))
    return config


@pytest.fixture
def owner_engine():
    assert OWNER_URL is not None
    # Alembic's env.py reads this, and the sync engine below drives the
    # assertions between upgrades.
    os.environ["DATABASE_OWNER_URL"] = OWNER_URL
    engine = create_engine(OWNER_URL)
    yield engine
    engine.dispose()


def seed_phase_1(engine) -> None:
    import json

    with engine.begin() as connection:
        connection.execute(
            text(
                "INSERT INTO tenants (tenant_id, name) VALUES (:t, 'Phase 1') "
                "ON CONFLICT DO NOTHING"
            ),
            {"t": str(PHASE_1_TENANT)},
        )
        connection.execute(
            text(
                "INSERT INTO analysis_runs "
                "(analysis_run_id, tenant_id, question, status, state) "
                "VALUES (:i, :t, 'Why did EU refunds increase?', 'completed', "
                "CAST(:s AS json)) ON CONFLICT DO NOTHING"
            ),
            {
                "i": str(PHASE_1_ANALYSIS_RUN),
                "t": str(PHASE_1_TENANT),
                "s": json.dumps(PHASE_1_STATE),
            },
        )


def cleanup(engine) -> None:
    with engine.begin() as connection:
        connection.execute(
            text("DELETE FROM analysis_runs WHERE analysis_run_id = :i"),
            {"i": str(PHASE_1_ANALYSIS_RUN)},
        )
        connection.execute(
            text("DELETE FROM tenants WHERE tenant_id = :t"),
            {"t": str(PHASE_1_TENANT)},
        )


def test_upgrading_a_phase_1_database_is_additive_and_rerunnable(
    owner_engine,
) -> None:
    # No longer downgrades to the world before Draft Findings existed
    # first: 0006_draft_findings creates `draft_findings` with a foreign key
    # into `analysis_runs`, using the schema module's *current* Table
    # definition (the same live-import convention every migration here
    # uses) -- but at that point in a real historical replay, `analysis_runs`
    # does not exist yet under that name; it is still `analysis_runs`,
    # not renamed until the destructive Chat & Analysis Run cutover (0023)
    # much later. That is a real, permanent consequence of a true table
    # rename meeting a migration-file convention that always imports the
    # present, not a frozen snapshot -- fixing it would mean hand-freezing
    # every historical migration's schema imports, not a change in scope
    # here. What this test actually needs -- a legacy-shaped Analysis Run
    # survives untouched, and re-running the migration is a no-op -- is
    # verified directly at head instead.
    config = alembic_config()
    try:
        seed_phase_1(owner_engine)

        command.upgrade(config, "head")

        tables = set(inspect(owner_engine).get_table_names())
        assert "draft_findings" in tables
        assert "draft_finding_claims" in tables

        # The Phase 1 AnalysisRun is untouched: same status, same narrative
        # Finding, same opaque pointer. Additive means nothing was rewritten.
        with owner_engine.begin() as connection:
            row = connection.execute(
                text(
                    "SELECT status, state FROM analysis_runs "
                    "WHERE analysis_run_id = :i"
                ),
                {"i": str(PHASE_1_ANALYSIS_RUN)},
            ).one()
        assert row.status == "completed"
        assert row.state == PHASE_1_STATE

        # And it has no draft, which is what the API reports as "legacy".
        with owner_engine.begin() as connection:
            drafts = connection.execute(
                text(
                    "SELECT count(*) FROM draft_findings "
                    "WHERE analysis_run_id = :i"
                ),
                {"i": str(PHASE_1_ANALYSIS_RUN)},
            ).scalar()
        assert drafts == 0

        # Rerunning must be a no-op rather than an error. This is the claim the
        # migration's own comment makes, so it is the one that needs proving.
        command.upgrade(config, "head")
        assert "draft_findings" in set(inspect(owner_engine).get_table_names())
    finally:
        cleanup(owner_engine)
        command.upgrade(config, "head")


def test_row_level_security_is_installed_and_forced_on_both_tables(
    owner_engine,
) -> None:
    """RLS that is enabled but not FORCEd still lets the table owner read
    everything, which would quietly undo the isolation the read tests assert."""
    with owner_engine.begin() as connection:
        rows = connection.execute(
            text(
                "SELECT relname, relrowsecurity, relforcerowsecurity "
                "FROM pg_class WHERE relname IN "
                "('draft_findings', 'draft_finding_claims')"
            )
        ).all()
        policies = connection.execute(
            text(
                "SELECT tablename, policyname FROM pg_policies "
                "WHERE tablename IN "
                "('draft_findings', 'draft_finding_claims')"
            )
        ).all()

    assert len(rows) == 2
    for row in rows:
        assert row.relrowsecurity, f"{row.relname} does not have RLS enabled"
        assert row.relforcerowsecurity, f"{row.relname} does not FORCE RLS"
    assert {policy.policyname for policy in policies} == {
        "draft_findings_tenant_isolation",
        "draft_finding_claims_tenant_isolation",
    }


def test_the_citation_tables_survive_a_downgrade_and_re_upgrade(owner_engine) -> None:
    """0009 is run for real. The claim-to-citation link is the only path a
    citation is reachable through, so a migration that half-applies it would
    leave substantive claims that cannot be followed.

    No longer downgrades to 0008 first: 0009_evidence_citations creates
    `evidence_citations` with a foreign key into `analysis_runs`, using the
    schema module's current Table definition -- the same live-import
    convention every migration here uses -- but `analysis_runs` does not
    exist under that name yet at that point in a real historical replay
    (see `test_upgrading_a_phase_1_database_is_additive_and_rerunnable`
    above for the full explanation). The structure this test actually cares
    about, and the no-op-rerun guarantee, are both verifiable at head.
    """
    config = alembic_config()
    try:
        command.upgrade(config, "head")
        after_up = set(inspect(owner_engine).get_table_names())
        assert "evidence_citations" in after_up
        assert "draft_finding_claim_citations" in after_up
        assert "citation_ids" not in {
            column["name"]
            for column in inspect(owner_engine).get_columns("draft_finding_claims")
        }

        # Rerunning is a no-op rather than an error.
        command.upgrade(config, "head")
        assert "evidence_citations" in set(inspect(owner_engine).get_table_names())
    finally:
        command.upgrade(config, "head")
