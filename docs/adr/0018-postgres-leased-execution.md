---
id: adr-0018
title: Postgres leases own durable execution
type: adr
status: active
owner: unassigned
source: repository
created: 2026-08-01
updated: 2026-08-01
reviewed: 2026-08-01
confidence: verified
implementation: current
tags: [adr, postgres, jobs]
related: ["[[Postgres Control Plane]]", "[[Investigation Domain]]"]
repo_path: libs/adapters/postgres
---

# Postgres leases own durable execution

## Decision

One Postgres queue owns analytical and visualization jobs. Workers claim with
`FOR UPDATE SKIP LOCKED`, renew exclusive leases, recover expired leases, and
resume persisted checkpoints. Request handlers only commit work; they never run
it in request-bound background tasks.

Cancellation is cooperative at provider boundaries. A queued job terminates in
the cancellation transaction; a running request is allowed to return before the
next checkpoint observes cancellation. Retries are bounded and create explicit
lineage rather than rewriting terminal attempts.

## Consequences

No Redis, Celery, Kafka, or second scheduler is introduced. Postgres is already
the transactional authority, so job and product state can commit atomically.
