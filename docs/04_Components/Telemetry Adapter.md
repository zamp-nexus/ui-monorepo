---
id: component-telemetry-adapter
title: Telemetry Adapter
type: component
status: active
owner: unassigned
source: repository
created: 2026-07-29
updated: 2026-07-29
reviewed: 2026-07-29
confidence: verified
implementation: current
priority: high
tags: [component, telemetry, opentelemetry]
aliases: [telemetry]
related: ["[[Components MOC]]", "[[Audit and Observability Architecture]]", "[[Managed Service Readiness]]"]
repo_path: libs/adapters/telemetry
code_refs: [libs/adapters/telemetry/src/zentra_adapter_telemetry/tracing.py]
---

# Telemetry Adapter

This adapter instruments FastAPI, optionally configures an OTLP HTTP span
exporter, correlates internal Tenant UUIDs to the current span, and exposes
trace/span IDs for audit envelopes.

When no exporter endpoint exists, local tracing remains instrumented without
external export. Langfuse is reached through OTLP configuration; there is no
Langfuse-specific domain dependency.

Telemetry is operational and mutable; it is not Investigation Replay.
ClickHouse remains the immutable audit authority.

Cloud verification is deferred to [[Complete Cloud Operational Sign-off]].

Parent: [[Components MOC]]
