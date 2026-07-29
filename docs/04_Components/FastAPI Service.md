---
id: component-api
title: FastAPI Service
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
tags: [component, api, python]
aliases: [api, zentra-api]
related: ["[[Components MOC]]", "[[Health and Context API]]", "[[Investigation API]]"]
depends_on: ["[[Investigation Core]]", "[[Postgres Adapter]]", "[[ClickHouse Adapter]]", "[[Cube Adapter]]", "[[Telemetry Adapter]]"]
repo_path: apps/api
code_refs:
  - apps/api/src/zentra_api/main.py
  - apps/api/src/zentra_api/dependencies.py
  - apps/api/src/zentra_api/routes.py
---

# FastAPI Service

The API is the backend composition root. It owns HTTP routing, request models,
authentication dependencies, CORS, lifecycle startup/shutdown, dependency
health checks, and adapter wiring.

`AppDependencies` constructs Postgres, ClickHouse, Cube, JWT verification,
Investigation service, and audit delivery from Settings. The lifespan starts the
outbox dispatcher and closes external clients.

The service exposes liveness/readiness, internal identity context, Investigation
create/read, and Human Approval decision endpoints. Domain and application rules
remain outside FastAPI.

Run with `npm exec -- nx serve api`; verify with the `api` lint/test/build
targets.

Failures: [[Diagnose Degraded Readiness]] and
[[Recover Audit Delivery Backlog]].

Parent: [[Components MOC]]
