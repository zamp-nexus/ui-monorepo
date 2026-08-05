---
id: component-postgres-adapter
title: Postgres Adapter
type: component
status: active
owner: unassigned
source: repository
created: 2026-07-29
updated: 2026-07-29
reviewed: 2026-07-29
confidence: verified
implementation: current
priority: critical
tags: [component, postgres, adapter]
aliases: [postgres]
related: ["[[Components MOC]]", "[[Postgres Control Plane]]", "[[Tenancy Security]]"]
depends_on: ["[[Investigation Core]]"]
repo_path: libs/adapters/postgres
code_refs:
  - libs/adapters/postgres/src/zentra_adapter_postgres/analysis_run.py
  - libs/adapters/postgres/src/zentra_adapter_postgres/schema.py
---

# Postgres Adapter

This SQLAlchemy Core/Psycopg adapter implements Investigation, Human Approval,
Agent Execution, audit outbox, and Unit of Work ports. Persistence records are
rehydrated into domain objects but do not become domain models.

Each UoW opens a transaction, sets tenant context, and commits only after the
application explicitly requests it. Investigation saves use expected versions;
approval decisions use row locks; outbox writes share the same transaction.

Alembic owns schema evolution. A migration owner applies DDL while the runtime
identity receives restricted table/sequence access and remains subject to RLS.

There is exactly one revision, `0001_initial_schema`. The ~30 incremental
revisions that preceded it were collapsed into it when Tenant was renamed to
Organization: with no production deployment there was no history to preserve
(see [[adr/0030-destructive-reset-for-the-chat-and-analysis-cutover]]). It creates
every table from `schema.metadata` in one pass, then installs the
`{table}_organization_isolation` RLS policies keyed on `app.organization_id`,
the `zentra_runtime` grants (including the append-only carve-outs on
`messages` and `activity_events`, and the no-delete ones on the
`visualization_*` briefs and artifacts), the LangGraph checkpoint tables, and
the Agent Registry seed rows.

Data detail: [[Postgres Control Plane]]. Recovery:
[[Recover Failed Postgres Migration]].

Parent: [[Components MOC]]
