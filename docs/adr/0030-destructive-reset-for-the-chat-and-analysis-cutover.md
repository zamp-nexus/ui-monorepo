---
id: adr-0030
title: Destructive reset for the chat and analysis cutover — no migration path
type: adr
status: proposed
owner: unassigned
source: decision
created: 2026-08-02
updated: 2026-08-02
reviewed: 2026-08-02
confidence: verified
implementation: planned
tags: [adr, chat, investigation, migration]
related: ["[[adr/0028-chat-session-and-analysis-run-replace-investigation-thread-and-investigation]]"]
repo_path: libs/adapters/postgres/migrations
---

# Destructive reset for the chat and analysis cutover — no migration path

## Decision

The Tenant, Project, Investigation Thread, and Investigation tables are
dropped and recreated as Organization, Chat Session, Message, and Analysis
Run — no data migration, no dual-write period, no read-compatibility layer
for the old schema. The product has no production deployment and no
committed customer data to protect; the only infrastructure spend on record
is a fixed ClickHouse credit unrelated to this schema.

## Consequences

Any historical Investigation/Thread data does not survive this cutover. This
is a deliberate, one-time exception justified specifically by pre-launch
status, not a general policy of skipping migrations — a schema change made
after real Organizations exist should not default to this approach without
the same justification holding.

## Reconciliation note

This Decision's "Tenant... dropped and recreated as Organization" claim was
drafted ahead of the actual rename — the migration this ADR originally
authorized (`0023_chat_analysis_run_cutover.py`) touched only the chat/analysis
tables and never renamed `tenants` itself, leaving the claim unexecuted for
several weeks. The full Tenant → Organization rename (Postgres schema, RLS,
every domain/application subsystem, the Clerk provisioning webhook) is what
actually executes it, using this same "no production deployment, no migration
path" reasoning extended to the rest of the schema.
