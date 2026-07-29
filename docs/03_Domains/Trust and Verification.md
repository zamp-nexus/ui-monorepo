---
id: domain-trust-verification
title: Trust and Verification
type: domain
status: active
owner: unassigned
source: context-map
created: 2026-07-29
updated: 2026-07-29
reviewed: 2026-07-29
confidence: verified
implementation: current
priority: critical
tags: [domain, trust, approval, audit]
related: ["[[Domains MOC]]", "[[Investigation Domain]]", "[[ClickHouse Audit Ledger]]"]
repo_path: libs/domain/CONTEXT.md
code_refs:
  - libs/domain/CONTEXT.md
  - libs/domain/investigation/src/zentra_domain_investigation/model.py
  - libs/adapters/clickhouse/src/zentra_adapter_clickhouse/audit.py
---

# Trust and Verification

Trust is expressed through typed validation, Evidence References, explicit
Human Approval, immutable Audit Entries, and Investigation Replay.

A Human Approval blocks work that cannot proceed autonomously. In Phase 1A,
tenant policy requires review because each month contains only four governed
orders. Owner/admin Users decide; approval completes the Finding and rejection
records one structured reason.

An Audit Entry is a tenant-scoped fact about process, not a log line or reasoning
dump. Replay is the ordered record connecting question, evidence, validation,
and judgment.

The UI displays structured rationale and audit facts. It never exposes hidden
chain-of-thought or invents confidence.

Parent: [[Domains MOC]]
