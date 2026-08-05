from copy import deepcopy

from zentra_api.workflow_routes import _document_error, _routing_profile_error
from zentra_api.workflow_schemas import (
    DEFAULT_WORKFLOW_DEFINITION,
    NEW_WORKFLOW_DEFINITION,
    WorkflowRoutingProfile,
)


def test_system_workflow_is_structurally_publishable() -> None:
    assert _document_error(DEFAULT_WORKFLOW_DEFINITION) is None


def test_new_workflow_template_is_structurally_publishable() -> None:
    assert _document_error(NEW_WORKFLOW_DEFINITION) is None


def test_auto_enabled_workflow_requires_a_routing_profile() -> None:
    assert _routing_profile_error(WorkflowRoutingProfile(auto_select_enabled=True)) == "An Auto-enabled Workflow needs a routing purpose"


def test_complete_routing_profile_is_publishable() -> None:
    assert _routing_profile_error(WorkflowRoutingProfile(auto_select_enabled=True, purpose="Investigates revenue questions", tags=["revenue"], example_requests=["Why did revenue change?"])) is None


def test_workflow_requires_one_controller() -> None:
    document = deepcopy(DEFAULT_WORKFLOW_DEFINITION)
    document["nodes"][1]["data"]["controller"] = False

    assert _document_error(document) == "A Workflow needs exactly one controller"


def test_loop_requires_a_positive_bound() -> None:
    document = deepcopy(DEFAULT_WORKFLOW_DEFINITION)
    document["edges"][3]["data"]["max_iterations"] = 0

    assert (
        _document_error(document) == "A loop edge needs a positive max_iterations value"
    )


def test_workflow_requires_a_path_from_its_trigger_to_a_result() -> None:
    document = deepcopy(DEFAULT_WORKFLOW_DEFINITION)
    document["edges"] = document["edges"][:-1]

    assert (
        _document_error(document) == "A Workflow needs a terminal path from its trigger"
    )


def test_cycle_cannot_hide_its_loop_metadata() -> None:
    document = deepcopy(DEFAULT_WORKFLOW_DEFINITION)
    document["edges"][3]["data"].pop("is_loop")

    assert (
        _document_error(document) == "Every Workflow cycle needs bounded loop metadata"
    )


def test_workflow_rejects_an_unregistered_tool() -> None:
    document = deepcopy(DEFAULT_WORKFLOW_DEFINITION)
    document["nodes"][2]["data"]["tools"] = ["shell"]

    assert _document_error(document) == "Workflow agents may use only registered tools"


def test_workflow_rejects_agent_with_missing_object_data() -> None:
    document = deepcopy(DEFAULT_WORKFLOW_DEFINITION)
    document["nodes"][2]["data"] = None

    assert _document_error(document) == "Every Workflow agent needs object data"


def test_only_analyst_and_evaluator_may_receive_data_tools() -> None:
    document = deepcopy(DEFAULT_WORKFLOW_DEFINITION)
    document["nodes"][1]["data"]["tools"] = ["connection_inventory"]

    assert (
        _document_error(document)
        == "Only Cube Analyst and Evaluator may use data tools"
    )


def test_evaluator_may_receive_data_tools() -> None:
    document = deepcopy(DEFAULT_WORKFLOW_DEFINITION)
    document["nodes"][3]["data"]["tools"] = [
        "connection_inventory",
        "schema_inspect",
        "data_query",
    ]

    assert _document_error(document) is None


def test_legacy_studio_roles_remain_compatible() -> None:
    document = deepcopy(DEFAULT_WORKFLOW_DEFINITION)
    document["nodes"][2]["data"]["role"] = "analyst"
    document["nodes"][3]["data"]["role"] = "reviewer"

    assert _document_error(document) is None
