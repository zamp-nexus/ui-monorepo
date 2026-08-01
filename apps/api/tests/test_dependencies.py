"""The switch from setting to graph.

`_build_graph_factory` is the only place the graph's shape is decided.
Nothing else can write a Finding, so a graph assembled without Insight — or
without requiring it of the registry — is one that fails at its last node
instead of at plan time. It returns a builder rather than a graph directly
because the semantic layer must be supplied per (tenant, Data Connection),
not fixed at factory-construction time — see `ScopedCubeSemanticLayers`.
"""

from __future__ import annotations

from zentra_adapter_model_providers import (
    ModelTier,
    ProviderCircuitBreaker,
    ProviderClients,
)
from zentra_domain_agent_execution import AgentRole

from zentra_api.dependencies import _build_graph_factory


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


def build():
    factory = _build_graph_factory(
        tier=ModelTier.FREE,
        models=ProviderClients.from_keys({}),
        breaker=ProviderCircuitBreaker(),
        registry=Registry(),  # type: ignore[arg-type]
        recorder=Recorder(),  # type: ignore[arg-type]
    )
    return factory(Layer())  # type: ignore[arg-type]


def test_every_graph_runs_insight() -> None:
    """Not a flag any more. The Orchestrator no longer synthesises, so a graph
    without Insight has nothing that could write a Finding."""
    assert build()._insight is not None


def test_insight_is_a_required_role() -> None:
    """The fail-closed half. A deployment whose registry has not promoted
    Insight must refuse at plan time rather than reach the last node with
    nothing to run."""
    required = build()._orchestrator._required_roles

    assert AgentRole.INSIGHT in required
    assert AgentRole.CUBE_ANALYST in required
    assert AgentRole.EVALUATOR in required


def test_the_graph_has_no_synthesis_node() -> None:
    """Absent, not merely unreachable. A node wired in but never entered could
    be reached again by one edge change."""
    nodes = build()._graph.nodes  # type: ignore[attr-defined]

    assert "synthesize" not in nodes
    assert "insight" in nodes
