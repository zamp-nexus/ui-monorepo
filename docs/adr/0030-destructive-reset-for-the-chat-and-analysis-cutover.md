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
