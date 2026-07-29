---
id: reference-configuration
title: Configuration Reference
type: reference
status: active
owner: unassigned
source: repository
created: 2026-07-29
updated: 2026-07-29
reviewed: 2026-07-29
confidence: verified
implementation: current
priority: high
tags: [operations, configuration, environment]
related: ["[[Operations MOC]]", "[[FastAPI Service]]", "[[Forensic Observatory]]"]
repo_path: apps/api/.env.example
code_refs:
  - apps/api/.env.example
  - apps/zentra-os/.env.example
  - apps/api/src/zentra_api/settings.py
  - infra/terraform/variables.tf
---

# Configuration Reference

Never record values or tokens in this vault.

## API

| Category | Variables |
| --- | --- |
| Runtime | `ENVIRONMENT`, `FRONTEND_ORIGIN` |
| Postgres | `DATABASE_URL`, operator-only `DATABASE_OWNER_URL` |
| ClickHouse | `CLICKHOUSE_HOST`, `PORT`, `USERNAME`, `PASSWORD`, `DATABASE`, `SECURE` |
| Cube | `CUBE_URL`, `CUBE_API_SECRET` |
| Clerk | `CLERK_ISSUER`, `CLERK_AUDIENCE` |
| Telemetry | `OTEL_EXPORTER_OTLP_ENDPOINT`, `OTEL_EXPORTER_OTLP_HEADERS` |
| Validation only | `E2B_API_KEY` |

`DATABASE_OWNER_URL` is consumed by migration tooling, not ordinary request
handling.

## Frontend

`VITE_CLERK_PUBLISHABLE_KEY` and `VITE_API_URL` are build/runtime browser
configuration. Only publishable values may use the Vite prefix.

## Terraform providers

Provider credentials use environment variables. Stack inputs include
environment, Neon/ClickHouse regions, ClickHouse allowed CIDR, and a sensitive
owner password. State and plans may contain sensitive connection data and remain
outside Git.

## Test integration

CI supplies `TEST_DATABASE_OWNER_URL`, `TEST_DATABASE_RUNTIME_URL`,
`TEST_CLICKHOUSE_HOST`, `TEST_CLICKHOUSE_PORT`, and `TEST_CUBE_URL`.

Parent: [[Operations MOC]]
