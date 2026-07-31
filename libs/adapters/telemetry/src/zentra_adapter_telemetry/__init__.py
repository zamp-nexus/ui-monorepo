"""ZentraOS OpenTelemetry adapter"""

from .tracing import (
    TelemetrySettings,
    configure_telemetry,
    correlate_tenant,
    current_trace_ids,
    record_citation_resolution,
)

__all__ = [
    "TelemetrySettings",
    "configure_telemetry",
    "correlate_tenant",
    "record_citation_resolution",
    "current_trace_ids",
]
