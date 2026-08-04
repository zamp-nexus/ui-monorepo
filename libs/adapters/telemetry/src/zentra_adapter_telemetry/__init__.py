"""ZentraOS OpenTelemetry adapter"""

from .metrics import SAFE_DIMENSIONS
from .tracing import (
    SAFE_ATTRIBUTES,
    TelemetrySettings,
    configure_telemetry,
    correlate_investigation,
    correlate_organization,
    correlate_thread,
    current_trace_ids,
    record_agent_execution,
    record_citation_resolution,
    record_evidence_deletion,
    record_insight_execution,
    record_publication_decision,
    record_skill_activation,
    record_tool_call,
)

__all__ = [
    "SAFE_ATTRIBUTES",
    "SAFE_DIMENSIONS",
    "TelemetrySettings",
    "configure_telemetry",
    "correlate_investigation",
    "correlate_organization",
    "correlate_thread",
    "current_trace_ids",
    "record_agent_execution",
    "record_citation_resolution",
    "record_evidence_deletion",
    "record_insight_execution",
    "record_publication_decision",
    "record_skill_activation",
    "record_tool_call",
]
