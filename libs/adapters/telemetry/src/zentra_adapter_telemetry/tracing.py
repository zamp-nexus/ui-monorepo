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


@dataclass(frozen=True, slots=True)
class TelemetrySettings:
    service_name: str = "zentra-api"
    otlp_endpoint: str | None = None
    otlp_headers: str | None = None


def correlate_tenant(tenant_id: UUID) -> None:
    trace.get_current_span().set_attribute("zentra.tenant_id", str(tenant_id))


def record_citation_resolution(*, state: str, duration_ms: int) -> None:
    """How a citation resolution went, and how long it took.

    Deliberately only these two. An operator needs to tell "slow" from
    "missing" from "denied"; none of that requires the evidence itself, and a
    span attribute is one of the easiest places for it to leak.
    """
    span = trace.get_current_span()
    span.set_attribute("zentra.citation.state", state)
    span.set_attribute("zentra.citation.duration_ms", duration_ms)


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
            headers=settings.otlp_headers,
        )
        provider.add_span_processor(BatchSpanProcessor(exporter))
        trace.set_tracer_provider(provider)
    FastAPIInstrumentor.instrument_app(app)
