"""Baselines are read from the ledger, and stay baselines.

Two things are being defended. That the report costs nothing beyond the
ClickHouse the product already runs — it queries `audit_entries`, opens no
second store, and needs no vendor. And that it never becomes a gate: #23 asks
for observed baselines *without* inventing a production threshold, and the
distance between "here is the observed p95" and "the build fails above 4s" is
one well-meaning commit.
"""

from __future__ import annotations

import os
import sys

import clickhouse_connect
import pytest
from clickhouse_connect.driver.exceptions import DatabaseError

from zentra_adapter_clickhouse.baselines import (
    AgentBaseline,
    agent_baselines,
    investigation_baseline,
    main,
    render,
)

_AGENTS = [
    AgentBaseline(
        agent_id="insight_v1",
        model="anthropic/claude-sonnet-5",
        outcome="succeeded",
        executions=42,
        latency_p50_ms=1450.0,
        latency_p95_ms=4210.0,
        cost_p50_usd=0.0181,
        cost_p95_usd=0.0402,
        total_cost_usd=0.83,
        total_tokens=64_800,
    )
]
_INVESTIGATIONS = {
    "investigations": 42,
    "cost_p50_usd": 0.0611,
    "cost_p95_usd": 0.1204,
    "cost_total_usd": 2.71,
    "latency_p50_ms": 8100.0,
    "latency_p95_ms": 19400.0,
}


def test_the_report_says_it_is_an_observation_not_a_threshold() -> None:
    output = render(_AGENTS, _INVESTIGATIONS, days=7)

    assert "Observations, not thresholds" in output
    assert "n=42" in output


def test_a_small_sample_says_so_rather_than_implying_precision() -> None:
    """Twelve Investigations do not have a p95, whatever the arithmetic says."""
    output = render(_AGENTS, {**_INVESTIGATIONS, "investigations": 12}, days=7)

    assert "too small for p95" in output


def test_a_large_sample_does_not_carry_the_caveat() -> None:
    output = render(_AGENTS, _INVESTIGATIONS, days=7)

    assert "too small for p95" not in output


def test_an_empty_window_reports_nothing_rather_than_zeroes() -> None:
    """A cost of $0.0000 and no data are different claims."""
    output = render([], {}, days=7)

    assert "Nothing to report" in output
    assert "$0.0000" not in output


def test_reporting_a_baseline_cannot_fail_a_build(monkeypatch) -> None:
    """The exit code is the difference between a baseline and a threshold."""

    class _Client:
        def query(self, *_args, **_kwargs):
            raise AssertionError("should not be reached in this test")

        def close(self) -> None:
            return None

    monkeypatch.setattr("zentra_adapter_clickhouse.baselines._client", _Client)
    monkeypatch.setattr(
        "zentra_adapter_clickhouse.baselines.agent_baselines",
        lambda *_a, **_k: _AGENTS,
    )
    monkeypatch.setattr(
        "zentra_adapter_clickhouse.baselines.investigation_baseline",
        lambda *_a, **_k: _INVESTIGATIONS,
    )
    monkeypatch.setattr(sys, "argv", ["baselines.py", "--days", "7"])

    assert main() == 0


_CLICKHOUSE_HOST = os.getenv("TEST_CLICKHOUSE_HOST")

_needs_clickhouse = pytest.mark.skipif(
    not _CLICKHOUSE_HOST,
    reason="local ClickHouse integration service is not configured",
)


def _runtime_client():
    return clickhouse_connect.get_client(
        host=_CLICKHOUSE_HOST,
        port=int(os.getenv("TEST_CLICKHOUSE_PORT", "8123")),
        username="zentra_audit_app",
        password="zentra_audit_app",
        database="zentra_audit",
    )


@_needs_clickhouse
def test_the_agent_baseline_returns_the_rows_that_are_there() -> None:
    """Assert on the contents, not on the type.

    An earlier version of this filtered `status = 'succeeded'`, which is not a
    value this column ever holds — the enum says `success`. The query returned
    zero rows for every window and a test that asserted `isinstance(agents,
    list)` passed the whole time. Counting the rows independently and demanding
    the same number back is the check that would have caught it.
    """
    client = _runtime_client()
    try:
        expected = client.query(
            """
            SELECT count()
            FROM (
                SELECT 1 FROM audit_entries
                WHERE agent_id IS NOT NULL
                  AND event_type IN (
                      'agent.execution_completed', 'agent.execution_failed'
                  )
                GROUP BY
                    agent_id,
                    model,
                    if(event_type = 'agent.execution_failed', 'failed', 'succeeded')
            )
            """
        ).result_rows[0][0]
        agents = agent_baselines(client, days=365 * 20)
    finally:
        client.close()

    assert expected > 0, "seed the ledger first; this test needs rows to mean anything"
    assert len(agents) == expected
    assert all(agent.executions > 0 for agent in agents)
    # Derived from the event type. The `status` column holds the Investigation's
    # status on these rows, so it cannot tell a failed execution from a good one.
    assert {agent.outcome for agent in agents} <= {"succeeded", "failed"}
    assert "failed" in {agent.outcome for agent in agents}


@_needs_clickhouse
def test_the_investigation_baseline_counts_real_investigations() -> None:
    client = _runtime_client()
    try:
        expected = client.query(
            "SELECT uniqExact(investigation_id) FROM audit_entries"
        ).result_rows[0][0]
        investigations = investigation_baseline(client, days=365 * 20)
    finally:
        client.close()

    assert expected > 0
    assert investigations["investigations"] == expected


@_needs_clickhouse
@pytest.mark.parametrize(
    "statement",
    [
        "ALTER TABLE audit_entries DELETE WHERE 1 = 1",
        "TRUNCATE TABLE audit_entries",
        "DROP TABLE audit_entries",
        "ALTER TABLE audit_entries ADD COLUMN leaked String",
    ],
)
def test_the_runtime_user_can_only_insert_and_select(statement: str) -> None:
    """Insert and select, and nothing else — criterion 7.

    Checked by attempting each destructive operation rather than by reading the
    grant table, because what a grant means is decided by the server and not by
    our reading of a DDL file. `UPDATE` is covered in `test_integration.py`;
    these are the four ways to destroy the ledger that it does not cover.
    """
    client = _runtime_client()
    try:
        with pytest.raises(DatabaseError, match="Not enough privileges"):
            client.command(statement)
    finally:
        client.close()
