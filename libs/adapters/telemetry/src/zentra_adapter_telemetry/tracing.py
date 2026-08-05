from __future__ import annotations

from dataclasses import dataclass
from uuid import UUID, uuid4

from fastapi import FastAPI
from opentelemetry import trace
from opentelemetry.exporter.otlp.proto.http.trace_exporter import OTLPSpanExporter
from opentelemetry.instrumentation.fastapi import FastAPIInstrumentor
from opentelemetry.sdk.resources import Resource
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import BatchSpanProcessor

from .metrics import configure_metrics, dimensions, instruments, parse_headers


@dataclass(frozen=True, slots=True)
class TelemetrySettings:
    service_name: str = "zentra-api"
    otlp_endpoint: str | None = None
    otlp_headers: str | None = None


def correlate_organization(organization_id: UUID) -> None:
    trace.get_current_span().set_attribute(
        "zentra.organization_id", str(organization_id)
    )


#: Every attribute this module is allowed to set. An allowlist rather than a
#: convention, because a span attribute is one of the easiest places for
#: evidence to leak and "we remembered not to" is not a guarantee. The
#: regression test walks this list; adding a key here is a deliberate act.
SAFE_ATTRIBUTES: frozenset[str] = frozenset(
    {
        "zentra.organization_id",
        "zentra.analysis_run_id",
        # Chat Session correlation (paired with zentra.analysis_run_id)
        "zentra.thread_id",
        # Insight execution
        "zentra.insight.agent_id",
        "zentra.insight.model",
        "zentra.insight.provider",
        "zentra.insight.fallback_count",
        "zentra.insight.input_tokens",
        "zentra.insight.output_tokens",
        "zentra.insight.cost_usd",
        "zentra.insight.duration_ms",
        "zentra.insight.status",
        "zentra.insight.error_category",
        # Publication policy
        "zentra.publication.decision",
        "zentra.publication.failed_conditions",
        # Citation resolution
        "zentra.citation.state",
        "zentra.citation.duration_ms",
        "zentra.citation.failure_category",
        # Evidence deletion
        "zentra.deletion.erasure_id",
        "zentra.deletion.progress",
        "zentra.deletion.attempts",
        "zentra.deletion.duration_ms",
        "zentra.deletion.failure_category",
        # Generic Agent execution: Intake, Cube Analyst, Data Visualization.
        # Insight keeps its own zentra.insight.* recorder above — its shape
        # predates this one and nothing about it needed to change.
        "zentra.agent.role",
        "zentra.agent.agent_id",
        "zentra.agent.model",
        "zentra.agent.provider",
        "zentra.agent.fallback_count",
        "zentra.agent.input_tokens",
        "zentra.agent.output_tokens",
        "zentra.agent.cost_usd",
        "zentra.agent.duration_ms",
        "zentra.agent.status",
        "zentra.agent.error_category",
        # Tool calls, across every Agent that holds one
        "zentra.tool.role",
        "zentra.tool.name",
        "zentra.tool.status",
        "zentra.tool.latency_ms",
        # Analysis-run aggregates
        "zentra.analysis_run.status",
        "zentra.analysis_run.duration_ms",
        "zentra.analysis_run.tool_call_count",
        "zentra.analysis_run.inventory_cache_hits",
        "zentra.analysis_run.schema_snapshot_reuses",
        # Skill activations
        "zentra.skill.role",
        "zentra.skill.names",
    }
)

_ANALYSIS_RUN_STATUSES = frozenset({"success", "failure", "cancelled"})


def _record(attributes: dict[str, object]) -> None:
    """Set span attributes, refusing anything not on the allowlist.

    Raising rather than dropping: a telemetry call that silently discarded a
    key would leave an operator waiting for a signal that never arrives, and a
    developer believing they had added one.
    """
    unknown = set(attributes) - SAFE_ATTRIBUTES
    if unknown:
        raise ValueError(
            f"Telemetry attribute not on the safe list: {', '.join(sorted(unknown))}"
        )
    span = trace.get_current_span()
    for key, value in attributes.items():
        if value is not None:
            span.set_attribute(key, value)


def record_insight_execution(
    *,
    agent_id: str,
    model: str | None,
    provider: str | None,
    fallback_count: int,
    input_tokens: int,
    output_tokens: int,
    cost_usd: str,
    duration_ms: int,
    status: str,
    error_category: str | None = None,
) -> None:
    """What the Insight step cost and how it went.

    `fallback_count` rather than the rungs themselves: the number tells an
    operator the chain degraded, and the rung strings are already in the audit
    ledger where they belong. `error_category` is a category — an error message
    is the one field most likely to quote the evidence back.
    """
    _record(
        {
            "zentra.insight.agent_id": agent_id,
            "zentra.insight.model": model,
            "zentra.insight.provider": provider,
            "zentra.insight.fallback_count": fallback_count,
            "zentra.insight.input_tokens": input_tokens,
            "zentra.insight.output_tokens": output_tokens,
            "zentra.insight.cost_usd": cost_usd,
            "zentra.insight.duration_ms": duration_ms,
            "zentra.insight.status": status,
            "zentra.insight.error_category": error_category,
        }
    )
    dims = dimensions(status=status, provider=provider, model=model)
    meters = instruments()
    meters.insight_duration.record(duration_ms, dims)
    meters.insight_cost.record(float(cost_usd), dims)
    meters.insight_tokens.record(input_tokens + output_tokens, dims)
    if fallback_count:
        meters.insight_fallbacks.add(fallback_count, dims)


def record_publication_decision(
    *,
    decision: str,
    failed_conditions: tuple[str, ...],
) -> None:
    """Which conditions failed, in the policy's own vocabulary.

    The condition names are a closed set the product already publishes; none
    of them carries a figure, a claim or an Organization's data.
    """
    _record(
        {
            "zentra.publication.decision": decision,
            "zentra.publication.failed_conditions": ",".join(failed_conditions),
        }
    )
    meters = instruments()
    meters.publication_decisions.add(1, dimensions(decision=decision))
    for condition in failed_conditions:
        # One series per condition rather than one per combination: an operator
        # asking "what is gating publication?" wants the conditions ranked, and
        # sixteen combination series cannot be ranked.
        meters.publication_failures.add(1, dimensions(condition=condition))


def record_citation_resolution(
    *,
    state: str,
    duration_ms: int,
    failure_category: str | None = None,
) -> None:
    """How a citation resolution went, how long it took, and why it did not.

    An operator needs to tell "slow" from "missing" from "denied" from "the
    store is down". The state answers the first three; without a category the
    fourth is indistinguishable from any other fault. None of it requires the
    evidence itself.
    """
    _record(
        {
            "zentra.citation.state": state,
            "zentra.citation.duration_ms": duration_ms,
            "zentra.citation.failure_category": failure_category,
        }
    )
    instruments().citation_duration.record(
        duration_ms,
        dimensions(state=state, failure_category=failure_category),
    )


def record_evidence_deletion(
    *,
    erasure_id: str,
    progress: str,
    attempts: int,
    duration_ms: int,
    failure_category: str | None = None,
) -> None:
    """How an erasure went, without any of what it erased.

    The erasure's own identity, not the AnalysisRun's content. A deletion's
    telemetry is the last place the deleted value could hide.
    """
    _record(
        {
            "zentra.deletion.erasure_id": erasure_id,
            "zentra.deletion.progress": progress,
            "zentra.deletion.attempts": attempts,
            "zentra.deletion.duration_ms": duration_ms,
            "zentra.deletion.failure_category": failure_category,
        }
    )
    # No erasure_id: safe to write once on a span, an unbounded series here.
    dims = dimensions(progress=progress, failure_category=failure_category)
    meters = instruments()
    meters.deletion_duration.record(duration_ms, dims)
    meters.deletion_operations.add(1, dims)


def record_agent_execution(
    *,
    role: str,
    agent_id: str,
    model: str | None,
    provider: str | None,
    fallback_count: int,
    input_tokens: int,
    output_tokens: int,
    cost_usd: str,
    duration_ms: int,
    status: str,
    error_category: str | None = None,
) -> None:
    """What a governed Agent step other than Insight cost and how it went.

    Intake, Cube Analyst and the Data Visualization Agent share this one
    recorder rather than each getting a bespoke `record_insight_execution`-
    shaped function: the fields they report are identical, and a third or
    fourth near-duplicate would only be a third or fourth place the allowlist
    could drift from what is actually written. `role` names which one ran.
    """
    _record(
        {
            "zentra.agent.role": role,
            "zentra.agent.agent_id": agent_id,
            "zentra.agent.model": model,
            "zentra.agent.provider": provider,
            "zentra.agent.fallback_count": fallback_count,
            "zentra.agent.input_tokens": input_tokens,
            "zentra.agent.output_tokens": output_tokens,
            "zentra.agent.cost_usd": cost_usd,
            "zentra.agent.duration_ms": duration_ms,
            "zentra.agent.status": status,
            "zentra.agent.error_category": error_category,
        }
    )
    dims = dimensions(role=role, status=status, provider=provider, model=model)
    meters = instruments()
    meters.agent_duration.record(duration_ms, dims)
    meters.agent_cost.record(float(cost_usd), dims)
    meters.agent_tokens.record(input_tokens + output_tokens, dims)
    if fallback_count:
        meters.agent_fallbacks.add(fallback_count, dims)


def record_tool_call(
    *, role: str, tool_name: str, status: str, latency_ms: int
) -> None:
    """That a tool ran, which one, and how it went. Never its arguments or
    results — `ToolInvocation` already withholds those (ADR-0006), and this
    recorder only ever sees what that type carries.
    """
    _record(
        {
            "zentra.tool.role": role,
            "zentra.tool.name": tool_name,
            "zentra.tool.status": status,
            "zentra.tool.latency_ms": latency_ms,
        }
    )
    instruments().tool_calls.add(
        1, dimensions(role=role, tool_name=tool_name, status=status)
    )


def record_analysis_run(
    *,
    status: str,
    duration_ms: int,
    tool_call_count: int,
    inventory_cache_hits: int,
    schema_snapshot_reuses: int,
) -> None:
    """Record safe, bounded aggregates for one completed analysis run."""
    if status not in _ANALYSIS_RUN_STATUSES:
        raise ValueError("analysis-run status must be success, failure, or cancelled")
    _record(
        {
            "zentra.analysis_run.status": status,
            "zentra.analysis_run.duration_ms": duration_ms,
            "zentra.analysis_run.tool_call_count": tool_call_count,
            "zentra.analysis_run.inventory_cache_hits": inventory_cache_hits,
            "zentra.analysis_run.schema_snapshot_reuses": schema_snapshot_reuses,
        }
    )
    dims = dimensions(status=status)
    meters = instruments()
    meters.analysis_run_duration.record(duration_ms, dims)
    meters.analysis_run_tool_calls.record(tool_call_count, dims)
    meters.analysis_run_snapshot_reuses.record(
        inventory_cache_hits + schema_snapshot_reuses, dims
    )


def record_skill_activation(*, role: str, skill_names: tuple[str, ...]) -> None:
    """Which Skills were appended to a role's system prompt for this execution.

    Skills are static per role rather than chosen per call
    (`SkillRegistry.apply`), so this reports the role's configuration at the
    moment it ran — the only way an operator or Langfuse could otherwise learn
    it is the system prompt itself, which this codebase deliberately never
    exports. Writes nothing for a role with no skills applied, the same
    "nothing to say" discipline the other recorders already follow.
    """
    if not skill_names:
        return
    _record(
        {
            "zentra.skill.role": role,
            "zentra.skill.names": ",".join(skill_names),
        }
    )
    meters = instruments()
    for name in skill_names:
        meters.skill_activations.add(1, dimensions(role=role, skill_name=name))


def correlate_analysis_run(analysis_run_id: UUID) -> None:
    """Internal identifier only, so a trace can be followed to its work.

    Never the question, which is an Organization's own words.
    """
    trace.get_current_span().set_attribute(
        "zentra.analysis_run_id", str(analysis_run_id)
    )


def correlate_thread(thread_id: UUID) -> None:
    """Internal identifier only, so a trace can be followed to its Chat
    Session. Mirrors `correlate_analysis_run`: never the message content,
    which is a Tenant's own words.
    """
    trace.get_current_span().set_attribute("zentra.thread_id", str(thread_id))


def current_trace_ids() -> tuple[UUID, UUID]:
    context = trace.get_current_span().get_span_context()
    trace_id = UUID(int=context.trace_id) if context.trace_id else uuid4()
    span_id = UUID(int=context.span_id) if context.span_id else uuid4()
    return trace_id, span_id


def configure_telemetry(app: FastAPI, settings: TelemetrySettings) -> None:
    if settings.otlp_endpoint:
        provider = TracerProvider(
            resource=Resource.create({"service.name": settings.service_name})
        )
        exporter = OTLPSpanExporter(
            endpoint=settings.otlp_endpoint,
            headers=parse_headers(settings.otlp_headers),
        )
        provider.add_span_processor(BatchSpanProcessor(exporter))
        trace.set_tracer_provider(provider)
    configure_metrics(
        service_name=settings.service_name,
        otlp_endpoint=settings.otlp_endpoint,
        otlp_headers=settings.otlp_headers,
    )
    FastAPIInstrumentor.instrument_app(app)
