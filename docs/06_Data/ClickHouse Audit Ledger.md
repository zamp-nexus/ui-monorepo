---
id: data-clickhouse-audit-ledger
title: ClickHouse Audit Ledger
type: data-model
status: active
owner: unassigned
source: repository
created: 2026-07-29
updated: 2026-07-29
reviewed: 2026-07-29
confidence: verified
implementation: current
priority: critical
tags: [data, clickhouse, audit]
related: ["[[Data MOC]]", "[[Audit and Observability Architecture]]", "[[Audit Outbox Delivery]]"]
repo_path: infra/clickhouse/init/001_audit_entries.sql
code_refs:
  - infra/clickhouse/init/001_audit_entries.sql
  - libs/adapters/clickhouse/src/zentra_adapter_clickhouse/audit.py
---

# ClickHouse Audit Ledger

`audit_entries` is the authoritative immutable Investigation Replay ledger. The
MergeTree order is `(tenant_id, investigation_id, created_at, entry_id)`.

The envelope includes trace/span IDs, tenant and Investigation, event type,
optional Agent/execution/step, timing, token/cost fields, input hash, typed
outcome, confidence when role-appropriate, tools/errors/model/status,
`artifact://` references, and redacted metadata.

Phase 1A deterministic events use validation outcomes and no confidence.
Application-generated event timestamps are monotonic so replay ordering
preserves causality even when transitions share a clock tick.

The runtime principal may insert/select only. Reads require internal tenant and
Investigation IDs. At-least-once delivery can create duplicate physical rows;
replay deduplicates stable `entry_id`.

Forbidden data includes prompts, raw analytical rows, uploaded values,
credentials, reviewer prose, and hidden reasoning.

Parent: [[Data MOC]]
