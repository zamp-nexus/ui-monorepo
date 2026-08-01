---
id: data-postgres-control-plane
title: Postgres Control Plane
type: data-model
status: active
owner: unassigned
source: repository
created: 2026-07-29
updated: 2026-08-01
reviewed: 2026-08-01
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
  - libs/adapters/postgres/migrations/versions/0014_workspace_groups_projects.py
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
| `workspace_groups` | Tenant-visible organizational Groups |
| `projects` | Projects inside a same-Tenant Group |
| `investigations` | Lifecycle, result, validation, version |
| `agent_executions` | Future bounded Agent invocations |
| `human_approvals` | Blocking decision and structured reason |
| `audit_outbox` | Transactional audit delivery state |
| `semantic_metrics` | Governed metric registration |
| `agent_registry` | Future Agent registration; currently empty |

Tenant-owned tables carry explicit `tenant_id`, foreign keys, checks,
uniqueness, timestamps, and access-path indexes. RLS uses transaction-local
`app.tenant_id` and fails closed without context.

Groups and Projects are organizational rather than authorization boundaries.
The `projects (group_id, tenant_id)` composite foreign key can reference only a
same-Tenant Group. Normalized Group names are unique within a Tenant and
normalized Project names are unique within their Group. Archiving records a
timestamp and never deletes or rewrites descendants. `projects.latest_activity_at`
is distinct from metadata `updated_at`, enabling stable recent-work ordering
without rewriting Project metadata.

Only one pending Human Approval may exist per Investigation. Investigation
versions support optimistic concurrency. The outbox records safe payload,
attempts, dispatch timestamp, and sanitized failure code.

Migrations are authoritative; SQLAlchemy Core declarations mirror them.

Parent: [[Data MOC]]
