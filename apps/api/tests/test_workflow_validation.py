from copy import deepcopy

from zentra_api.workflow_routes import _document_error
from zentra_api.workflow_schemas import DEFAULT_WORKFLOW_DEFINITION


def test_system_workflow_is_structurally_publishable() -> None:
    assert _document_error(DEFAULT_WORKFLOW_DEFINITION) is None


def test_workflow_requires_one_controller() -> None:
    document = deepcopy(DEFAULT_WORKFLOW_DEFINITION)
    document["nodes"][1]["data"]["controller"] = False

    assert _document_error(document) == "A Workflow needs exactly one controller"


def test_loop_requires_a_positive_bound() -> None:
    document = deepcopy(DEFAULT_WORKFLOW_DEFINITION)
    document["edges"][4]["data"]["max_iterations"] = 0

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
    document["edges"][4]["data"].pop("is_loop")

    assert (
        _document_error(document) == "Every Workflow cycle needs bounded loop metadata"
    )
