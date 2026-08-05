from uuid import UUID

from zentra_api.workflow_selection_service import (
    WorkflowCandidate,
    selection_from_recommendation,
)


def _candidate() -> WorkflowCandidate:
    return WorkflowCandidate(
        workflow_id=UUID("11000000-0000-0000-0000-000000000001"),
        workflow_version=2,
        name="Revenue investigation",
        purpose="Investigates revenue changes",
        tags=("revenue",),
        example_requests=("Why did revenue change?",),
        priority=10,
    )


def test_selection_accepts_only_the_supplied_published_candidate() -> None:
    candidate = _candidate()

    selection = selection_from_recommendation(
        (candidate,), str(candidate.workflow_id), "Matches a revenue request"
    )

    assert selection.candidate == candidate
    assert selection.fallback is False


def test_selection_rejects_unknown_or_malformed_recommendations() -> None:
    candidate = _candidate()

    unknown = selection_from_recommendation(
        (candidate,), "22000000-0000-0000-0000-000000000002", None
    )
    malformed = selection_from_recommendation((candidate,), "not-a-uuid", None)

    assert unknown.candidate is None and unknown.fallback is True
    assert malformed.candidate is None and malformed.fallback is True
