from __future__ import annotations

from contextlib import AbstractAsyncContextManager
from datetime import UTC, datetime, timedelta
from uuid import UUID

import pytest
from zentra_domain_analysis_run import ExecutionJob, ExecutionJobStatus

from zentra_application_analysis_run import ExecutionJobWorker

NOW = datetime(2026, 8, 1, tzinfo=UTC)
TENANT_ID = UUID("20000000-0000-0000-0000-000000000002")
ANALYSIS_RUN_ID = UUID("30000000-0000-0000-0000-000000000003")
JOB_ID = UUID("51000000-0000-0000-0000-000000000001")


class Jobs:
    def __init__(self, job: ExecutionJob) -> None:
        self.job = job

    async def claim_next(
        self, *, worker_id: str, now: datetime, lease_for: timedelta
    ) -> ExecutionJob | None:
        if self.job.status is ExecutionJobStatus.QUEUED:
            self.job.claim(worker_id=worker_id, now=now, lease_for=lease_for)
            return self.job
        return None

    async def get_job(
        self, job_id: UUID, *, for_update: bool = False
    ) -> ExecutionJob | None:
        return self.job if self.job.job_id == job_id else None

    async def save_job(self, job: ExecutionJob) -> None:
        self.job = job


class UnitOfWork:
    def __init__(self, jobs: Jobs) -> None:
        self.jobs = jobs
        self.commits = 0

    async def __aenter__(self) -> UnitOfWork:
        return self

    async def __aexit__(self, *args: object) -> None:
        return None

    async def commit(self) -> None:
        self.commits += 1


class Factory:
    def __init__(self, job: ExecutionJob) -> None:
        self.uow = UnitOfWork(Jobs(job))

    async def bound_organization_ids(self) -> tuple[UUID, ...]:
        return (TENANT_ID,)

    def __call__(
        self, organization_id: UUID, trace_id: UUID, span_id: UUID
    ) -> AbstractAsyncContextManager[UnitOfWork]:
        assert organization_id == TENANT_ID
        return self.uow


class Executor:
    def __init__(self, error: Exception | None = None) -> None:
        self.error = error
        self.calls: list[UUID] = []
        self.failures: list[str] = []

    async def execute_job(self, *, organization_id: UUID, analysis_run_id: UUID) -> None:
        self.calls.append(analysis_run_id)
        if self.error is not None:
            raise self.error

    async def fail_job(
        self,
        *,
        organization_id: UUID,
        analysis_run_id: UUID,
        failure_category: str,
    ) -> None:
        self.failures.append(failure_category)


def job() -> ExecutionJob:
    return ExecutionJob.create(
        job_id=JOB_ID,
        organization_id=TENANT_ID,
        analysis_run_id=ANALYSIS_RUN_ID,
        now=NOW,
    )


@pytest.mark.asyncio
async def test_worker_claims_executes_and_completes_one_job() -> None:
    factory = Factory(job())
    executor = Executor()
    worker = ExecutionJobWorker(
        unit_of_work_factory=factory,
        executor=executor,
        worker_id="worker-a",
        now=lambda: NOW,
    )

    worked = await worker.run_once()

    assert worked is True
    assert executor.calls == [ANALYSIS_RUN_ID]
    assert factory.uow.jobs.job.status is ExecutionJobStatus.COMPLETED


@pytest.mark.asyncio
async def test_worker_requeues_only_transient_failures_with_bounded_backoff() -> None:
    factory = Factory(job())
    executor = Executor(TimeoutError("private provider detail"))
    worker = ExecutionJobWorker(
        unit_of_work_factory=factory,
        executor=executor,
        worker_id="worker-a",
        now=lambda: NOW,
    )

    await worker.run_once()

    queued = factory.uow.jobs.job
    assert queued.status is ExecutionJobStatus.QUEUED
    assert queued.failure_category == "network_error"
    assert queued.available_at == NOW + timedelta(seconds=2)
    assert executor.failures == []


@pytest.mark.asyncio
async def test_worker_fails_domain_errors_without_retrying_or_leaking_message() -> None:
    factory = Factory(job())
    executor = Executor(ValueError("customer secret in validation message"))
    worker = ExecutionJobWorker(
        unit_of_work_factory=factory,
        executor=executor,
        worker_id="worker-a",
        now=lambda: NOW,
    )

    await worker.run_once()

    failed = factory.uow.jobs.job
    assert failed.status is ExecutionJobStatus.FAILED
    assert failed.failure_category == "domain_failure"
    assert executor.failures == ["domain_failure"]
    assert "customer secret" not in repr(failed)


class _NoEnabledAgentLikeError(RuntimeError):
    """Stands in for `zentra_adapter_langgraph`'s `NoEnabledAgentError` --
    same `category`/`transient` shape, without this application-layer test
    depending on an adapter package."""

    category = "no_enabled_agent"
    transient = False


@pytest.mark.asyncio
async def test_a_named_failure_category_is_used_as_is_not_reclassified() -> None:
    """Regression: an error naming its own `category`/`transient` (as
    `NoEnabledAgentError` now does) must reach the ledger under that name,
    not fall through to the generic `unexpected` every unclassified bug also
    gets -- an operator needs to tell a registry-configuration gap from an
    actual defect."""
    factory = Factory(job())
    executor = Executor(_NoEnabledAgentLikeError("no promoted evaluator"))
    worker = ExecutionJobWorker(
        unit_of_work_factory=factory,
        executor=executor,
        worker_id="worker-a",
        now=lambda: NOW,
    )

    await worker.run_once()

    failed = factory.uow.jobs.job
    assert failed.status is ExecutionJobStatus.FAILED
    assert failed.failure_category == "no_enabled_agent"
