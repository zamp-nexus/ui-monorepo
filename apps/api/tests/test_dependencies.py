"""The switch from setting to graph.

`_build_graph` is the only place `insight_enabled` becomes both an Insight node
and a required role. Everything else in this feature is well covered, so an
untested switch here is exactly where a Phase 2 deployment could silently run
the Phase 1 path.
"""

from __future__ import annotations

import pytest
from zentra_adapter_model_providers import (
    ModelTier,
    ProviderCircuitBreaker,
    ProviderClients,
)
from zentra_domain_agent_execution import AgentRole

from zentra_api.dependencies import _build_graph


class Layer:
    async def catalog(self) -> object:  # pragma: no cover - never invoked
        raise AssertionError("not reached")

    async def query(self, request: object) -> object:  # pragma: no cover
        raise AssertionError("not reached")


class Registry:
    async def enabled_agents(self) -> tuple[()]:  # pragma: no cover
        return ()


class Recorder:
    async def record_started(self, start: object) -> None:  # pragma: no cover
        return None

    async def record(self, execution: object) -> None:  # pragma: no cover
        return None


def build(*, insight_enabled: bool):
    return _build_graph(
        tier=ModelTier.FREE,
        models=ProviderClients.from_keys({}),
        breaker=ProviderCircuitBreaker(),
        registry=Registry(),  # type: ignore[arg-type]
        semantic_layer=Layer(),  # type: ignore[arg-type]
        recorder=Recorder(),  # type: ignore[arg-type]
        insight_enabled=insight_enabled,
    )


@pytest.mark.parametrize("enabled", [True, False])
def test_the_flag_decides_whether_an_insight_agent_exists(enabled: bool) -> None:
    graph = build(insight_enabled=enabled)

    assert (graph._insight is not None) is enabled


def test_turning_insight_on_makes_it_a_required_role() -> None:
    """The fail-closed half. A Phase 2 deployment whose registry has not
    promoted Insight must refuse, and it only refuses if the Orchestrator was
    told to require the role."""
    graph = build(insight_enabled=True)

    required = graph._orchestrator._required_roles
    assert AgentRole.INSIGHT in required
    assert AgentRole.SQL_ANALYST in required
    assert AgentRole.EVALUATOR in required


def test_the_phase_1_path_does_not_require_insight() -> None:
    graph = build(insight_enabled=False)

    assert AgentRole.INSIGHT not in graph._orchestrator._required_roles


def test_the_insight_node_is_absent_from_the_phase_1_graph() -> None:
    """Not merely unreachable — absent. A node wired in but never entered would
    still let a future edge change turn Phase 2 on by accident."""
    assert "insight" not in build(insight_enabled=False)._graph.nodes  # type: ignore[attr-defined]
    assert "insight" in build(insight_enabled=True)._graph.nodes  # type: ignore[attr-defined]
