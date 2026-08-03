from uuid import UUID

from fastapi import FastAPI
from opentelemetry import trace

from zentra_adapter_telemetry import (
    TelemetrySettings,
    configure_telemetry,
    correlate_tenant,
    correlate_thread,
)


def test_configures_local_instrumentation_without_exporter() -> None:
    app = FastAPI()

    configure_telemetry(app, TelemetrySettings())

    assert app is not None


def test_correlates_internal_tenant_on_the_active_span(monkeypatch) -> None:
    attributes = {}

    class Span:
        def set_attribute(self, name: str, value: str) -> None:
            attributes[name] = value

    monkeypatch.setattr(
        "zentra_adapter_telemetry.tracing.trace.get_current_span",
        lambda: Span(),
    )
    tenant_id = UUID("91000000-0000-0000-0000-000000000001")

    correlate_tenant(tenant_id)

    assert attributes == {"zentra.tenant_id": str(tenant_id)}


def test_correlates_a_chat_session_on_the_active_span(monkeypatch) -> None:
    attributes = {}

    class Span:
        def set_attribute(self, name: str, value: str) -> None:
            attributes[name] = value

    monkeypatch.setattr(
        "zentra_adapter_telemetry.tracing.trace.get_current_span",
        lambda: Span(),
    )
    thread_id = UUID("91000000-0000-0000-0000-000000000002")

    correlate_thread(thread_id)

    assert attributes == {"zentra.thread_id": str(thread_id)}


def test_configuring_langfuse_shaped_settings_builds_a_working_exporter() -> None:
    """The whole of ADR-0031's infrastructure change: point the existing OTLP
    exporter at Langfuse Cloud's free tier. No new adapter, no new
    dependency — an endpoint and a Basic-auth header, verified at the
    settings level rather than against a real Langfuse project.
    """
    previous_tracer = trace._TRACER_PROVIDER  # noqa: SLF001
    app = FastAPI()
    settings = TelemetrySettings(
        otlp_endpoint="https://cloud.langfuse.com/api/public/otel",
        otlp_headers="Authorization=Basic cGstbGYtMTIzOnNrLWxmLTQ1Ng==",
    )

    try:
        configure_telemetry(app, settings)

        provider = trace.get_tracer_provider()
        (processor,) = provider._active_span_processor._span_processors  # noqa: SLF001
        exporter = processor.span_exporter
        assert exporter._endpoint == settings.otlp_endpoint  # noqa: SLF001
        assert exporter._headers == {  # noqa: SLF001
            "Authorization": "Basic cGstbGYtMTIzOnNrLWxmLTQ1Ng=="
        }
    finally:
        trace._TRACER_PROVIDER = previous_tracer  # noqa: SLF001
