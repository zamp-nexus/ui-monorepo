---
id: arch-audit-observability
title: Audit and Observability Architecture
type: architecture
status: active
owner: unassigned
source: repository
created: 2026-07-29
updated: 2026-07-29
reviewed: 2026-07-29
confidence: verified
implementation: current
priority: critical
tags: [audit, observability, architecture]
related: ["[[Architecture MOC]]", "[[ClickHouse Audit Ledger]]", "[[Audit Outbox Delivery]]"]
repo_path: apps/api/src/zentra_api/audit_delivery.py
code_refs:
  - apps/api/src/zentra_api/audit_delivery.py
  - libs/adapters/clickhouse/src/zentra_adapter_clickhouse/audit.py
  - libs/adapters/telemetry/src/zentra_adapter_telemetry/tracing.py
---

# Audit and Observability Architecture

Audit and telemetry answer different questions:

- ClickHouse records immutable, tenant-scoped process facts used for
  Investigation Replay.
- OpenTelemetry correlates runtime traces, spans, dependency timing, and tenant
  context for operational diagnosis.

Postgres and ClickHouse cannot share a transaction. State transitions therefore
enqueue redacted outbox events atomically in Postgres. A lifespan dispatcher
delivers them at least once with stable event IDs. Replay merges delivered
ClickHouse rows with pending outbox rows and deduplicates by event ID.

Audit entries may contain hashes, metric names, status, typed outcome kind,
timing, cost/token fields, tools/errors metadata, and `artifact://` references.
They must not contain prompts, raw Cube rows, uploaded values, reviewer prose,
credentials, or hidden reasoning.

Decisions: [[adr/0002-split-transactional-and-audit-storage]],
[[adr/0006-metadata-only-audit-ledger]], and
[[adr/0007-transactional-audit-outbox]].

Parent: [[Architecture MOC]]
