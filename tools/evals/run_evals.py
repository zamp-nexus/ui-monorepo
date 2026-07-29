"""Agent eval harness.

Each case pins a scripted model response and asserts what the agent does with
it: schema compliance, governed-member enforcement, confidence calibration
bounds, and evidence references. That is the deterministic half of the §3.11
framework — instruction adherence, schema compliance, and edge-case handling.

It deliberately does not score model quality: no live model is called, so a
case passing means the agent's own logic is correct, not that the model was
right. Functional known-answer pairs against a live model are Phase 4 work,
and `agent_registry.eval_status` should be read with that limit in mind.

Usage:
    uv run python tools/evals/run_evals.py
    uv run python tools/evals/run_evals.py --promote   # requires DATABASE_OWNER_URL
"""

from __future__ import annotations

import argparse
import asyncio
import json
import os
import sys
from collections.abc import Sequence
from dataclasses import dataclass
from decimal import Decimal
from pathlib import Path
from typing import Any
from uuid import UUID

from zentra_adapter_langgraph import (
    EvaluatorAgent,
    OrchestratorAgent,
    SqlAnalystAgent,
)
from zentra_domain_agent_execution import (
    AgentInput,
    AgentRole,
    ConfidenceOutcome,
    ExecutionUsage,
    ModelResponse,
    RegisteredAgent,
    SemanticCatalog,
    SemanticDimension,
    SemanticMeasure,
    SemanticQuery,
    SemanticResult,
)

EVALS_ROOT = Path(__file__).resolve().parents[2] / "evals"
INVESTIGATION_ID = UUID("11000000-0000-0000-0000-000000000001")
TENANT_ID = UUID("22000000-0000-0000-0000-000000000002")

AGENT_IDS = {
    "orchestrator": "orchestrator_v1",
    "sql_analyst": "sql_analyst_v1",
    "evaluator": "evaluator_v1",
}


class ReplayModel:
    """Returns the case's pinned responses in call order."""

    def __init__(self, responses: Sequence[dict[str, Any]]) -> None:
        self._responses = list(responses)
        self._index = 0

    async def complete(self, **kwargs: Any) -> ModelResponse:
        if self._index >= len(self._responses):
            raise AssertionError("Agent made more model calls than the case pins")
        payload = self._responses[self._index]
        self._index += 1
        return ModelResponse(
            text=json.dumps(payload),
            usage=ExecutionUsage(
                input_tokens=100,
                output_tokens=20,
                cost_usd=Decimal("0.001"),
                model=str(kwargs["model"]),
            ),
        )


class ReplaySemanticLayer:
    def __init__(self, catalog: dict[str, Any], rows: list[dict[str, Any]]) -> None:
        self._catalog = SemanticCatalog(
            measures=tuple(SemanticMeasure(**m) for m in catalog["measures"]),
            dimensions=tuple(SemanticDimension(**d) for d in catalog["dimensions"]),
        )
        self._rows = rows

    async def catalog(self) -> SemanticCatalog:
        return self._catalog

    async def query(self, request: SemanticQuery) -> SemanticResult:
        self._catalog.reject_ungoverned(request)
        return SemanticResult(query=request, rows=tuple(self._rows))


class ReplayRegistry:
    def __init__(self, roles: Sequence[str]) -> None:
        self._roles = roles

    async def enabled_agents(self) -> tuple[RegisteredAgent, ...]:
        return tuple(
            RegisteredAgent(
                agent_id=AGENT_IDS[role],
                role=AgentRole(role),
                version="1",
            )
            for role in self._roles
        )


@dataclass(slots=True)
class CaseResult:
    agent: str
    name: str
    passed: bool
    detail: str = ""


def _build_agent(case: dict[str, Any]) -> Any:
    agent = case["agent"]
    model = ReplayModel(case.get("model_responses", []))
    if agent == "orchestrator":
        return OrchestratorAgent(
            model=model,
            registry=ReplayRegistry(case.get("enabled_roles", [])),
        )
    layer = ReplaySemanticLayer(case["catalog"], case.get("rows", []))
    if agent == "sql_analyst":
        return SqlAnalystAgent(model=model, semantic_layer=layer)
    if agent == "evaluator":
        return EvaluatorAgent(model=model, semantic_layer=layer)
    raise ValueError(f"Unknown agent in case: {agent}")


async def _run_case(path: Path) -> CaseResult:
    case = json.loads(path.read_text())
    agent_name = case["agent"]
    expect = case["expect"]
    state = {**case["state"], "execution_id": str(INVESTIGATION_ID)}

    try:
        output = await _build_agent(case).invoke(
            AgentInput(
                investigation_id=INVESTIGATION_ID,
                tenant_id=TENANT_ID,
                state=state,
            )
        )
    except Exception as error:  # noqa: BLE001 - a refusal can be the expectation
        expected = expect.get("raises")
        if expected and type(error).__name__ == expected:
            return CaseResult(agent_name, case["name"], True)
        return CaseResult(
            agent_name,
            case["name"],
            False,
            f"unexpected {type(error).__name__}: {error}",
        )

    if expect.get("raises"):
        return CaseResult(
            agent_name,
            case["name"],
            False,
            f"expected {expect['raises']} but the agent returned a result",
        )

    problems: list[str] = []
    if "outcome_kind" in expect and output.outcome.kind != expect["outcome_kind"]:
        problems.append(f"outcome kind {output.outcome.kind}")
    if isinstance(output.outcome, ConfidenceOutcome):
        score = output.outcome.score
        if "min_score" in expect and score < expect["min_score"]:
            problems.append(f"score {score} below {expect['min_score']}")
        if "max_score" in expect and score > expect["max_score"]:
            problems.append(f"score {score} above {expect['max_score']}")
    if "evidence_refs" in expect and len(output.evidence_refs) != expect["evidence_refs"]:
        problems.append(f"{len(output.evidence_refs)} evidence refs")
    for key, value in expect.get("fields", {}).items():
        if output.fields.get(key) != value:
            problems.append(f"{key}={output.fields.get(key)!r}")
    for key in expect.get("field_present", []):
        if key not in output.fields:
            problems.append(f"missing field {key}")

    return CaseResult(agent_name, case["name"], not problems, "; ".join(problems))


async def _promote(passing: set[str]) -> None:
    from sqlalchemy import text
    from sqlalchemy.ext.asyncio import create_async_engine

    url = os.environ.get("DATABASE_OWNER_URL")
    if not url:
        raise SystemExit("--promote requires DATABASE_OWNER_URL")
    engine = create_async_engine(url)
    async with engine.begin() as connection:
        for agent, agent_id in AGENT_IDS.items():
            status = "passing" if agent in passing else "failing"
            await connection.execute(
                text(
                    "UPDATE agent_registry SET eval_status = :status, "
                    "enabled = :enabled WHERE agent_id = :agent_id"
                ),
                {
                    "status": status,
                    "enabled": status == "passing",
                    "agent_id": agent_id,
                },
            )
    await engine.dispose()


async def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--promote", action="store_true")
    args = parser.parse_args()

    results = [await _run_case(path) for path in sorted(EVALS_ROOT.glob("*/*.json"))]
    if not results:
        raise SystemExit(f"No eval cases found under {EVALS_ROOT}")

    by_agent: dict[str, list[CaseResult]] = {}
    for result in results:
        by_agent.setdefault(result.agent, []).append(result)

    passing: set[str] = set()
    for agent, cases in sorted(by_agent.items()):
        failed = [case for case in cases if not case.passed]
        for case in failed:
            print(f"FAIL {agent}/{case.name}: {case.detail}", file=sys.stderr)
        if not failed:
            passing.add(agent)
        print(f"{agent}: {len(cases) - len(failed)}/{len(cases)} passed")

    missing = set(AGENT_IDS) - set(by_agent)
    if missing:
        print(f"No cases for: {', '.join(sorted(missing))}", file=sys.stderr)

    if args.promote:
        await _promote(passing)
        print(f"Promoted to enabled: {', '.join(sorted(passing)) or 'none'}")

    return 0 if passing == set(AGENT_IDS) else 1


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
