---
id: data-postgres-control-plane
title: Postgres Control Plane
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
tags: [data, postgres, rls]
related: ["[[Data MOC]]", "[[Postgres Adapter]]", "[[Tenancy Security]]"]
repo_path: libs/adapters/postgres
code_refs:
  - libs/adapters/postgres/src/zentra_adapter_postgres/schema.py
  - libs/adapters/postgres/migrations/versions/0001_phase0_foundation.py
  - libs/adapters/postgres/migrations/versions/0002_phase1a_investigation.py
---

# Postgres Control Plane

Postgres owns transactional product state.

| Table | Authority |
| --- | --- |
| `tenants` | Internal customer organizations |
| `users` | Provider-neutral human identities |
| `identity_subjects` | Provider subject → User binding |
| `tenant_identity_bindings` | Provider organization → Tenant binding |
| `tenant_memberships` | User role inside Tenant |
| `investigations` | Lifecycle, result, validation, version |
| `agent_executions` | Future bounded Agent invocations |
| `human_approvals` | Blocking decision and structured reason |
| `audit_outbox` | Transactional audit delivery state |
| `semantic_metrics` | Governed metric registration |
| `agent_registry` | Future Agent registration; currently empty |

Tenant-owned tables carry explicit `tenant_id`, foreign keys, checks,
uniqueness, timestamps, and access-path indexes. RLS uses transaction-local
`app.tenant_id` and fails closed without context.

Only one pending Human Approval may exist per Investigation. Investigation
versions support optimistic concurrency. The outbox records safe payload,
attempts, dispatch timestamp, and sanitized failure code.

Migrations are authoritative; SQLAlchemy Core declarations mirror them.

Parent: [[Data MOC]]
