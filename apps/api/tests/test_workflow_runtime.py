import pytest

from zentra_api.workflow_runtime import WorkflowEngine, WorkflowStep
from zentra_api.workflow_schemas import DEFAULT_WORKFLOW_DEFINITION


@pytest.mark.asyncio
async def test_engine_follows_controller_route_and_bounded_retry() -> None:
    calls: list[str] = []

    async def invoke(node: dict[str, object], handoff: str) -> WorkflowStep:
        calls.append(str(node["id"]))
        if node["id"] == "orchestrator":
            return WorkflowStep(handoff=handoff, route="delegate")
        if node["id"] == "evaluator" and calls.count("evaluator") == 1:
            return WorkflowStep(handoff="needs a recheck", route="recheck")
        if node["id"] == "evaluator":
            return WorkflowStep(handoff="validated", route="validated")
        return WorkflowStep(handoff=f"{handoff} -> {node['id']}")

    result = await WorkflowEngine(DEFAULT_WORKFLOW_DEFINITION).run(
        "Why did refunds increase?", invoke
    )

    assert calls == ["orchestrator", "analyst", "evaluator", "analyst", "evaluator", "insight"]
    assert result.output.endswith("insight")
    assert result.routes == ("delegate", "evidence", "recheck", "evidence", "validated", "success")


@pytest.mark.asyncio
async def test_engine_stops_before_exceeding_a_loop_limit() -> None:
    async def invoke(node: dict[str, object], handoff: str) -> WorkflowStep:
        if node["id"] == "orchestrator":
            return WorkflowStep(handoff=handoff, route="delegate")
        if node["id"] == "evaluator":
            return WorkflowStep(handoff=handoff, route="recheck")
        return WorkflowStep(handoff=handoff)

    with pytest.raises(ValueError, match="loop limit"):
        await WorkflowEngine(DEFAULT_WORKFLOW_DEFINITION).run("Retry forever", invoke)
