---
id: arch-deployment-topology
title: Deployment Topology
type: architecture
status: active
owner: unassigned
source: repository
created: 2026-07-29
updated: 2026-08-05
reviewed: 2026-08-05
confidence: verified
implementation: current
priority: high
tags: [deployment, infrastructure, architecture]
related: ["[[Architecture MOC]]", "[[Infrastructure Topology]]", "[[Managed Service Readiness]]", "[[Phase 3 Data Execution]]"]
repo_path: infra
code_refs: [docker-compose.yml, apps/api/Dockerfile, infra/terraform/main.tf]
---

# Deployment Topology

## Local

Docker Compose starts control-plane Postgres, a separate warehouse Postgres,
ClickHouse, and Cube. The API may run on the host or through the optional
Compose `app` profile. The frontend runs through the Nx/Vite development server.

## Managed foundation

Terraform declares a Neon project in AWS US East and a ClickHouse Cloud service
in AWS US East. Managed credentials, state, and plans stay outside the
repository. Owner/migration and restricted runtime identities have different
privileges.

## Current production edge

The Nexus Vite single-page app is served from Vercel. Its deployment
configuration lives at the repository root in `vercel.json` and rewrites deep
links to `index.html`, allowing the browser router to resolve application
routes such as `/chats`. The API is a separate Render service; it is not on the
request path when Vercel resolves a frontend route.

Delivery-pipeline, secret-manager, rollback, and release-promotion details are
still not defined in the repository.

## Accepted Phase 3 target

Phase 3 selects only its new data plane: private Cloudflare R2 objects, a scale-
to-zero Google Cloud Run DuckDB worker, Google Secret Manager for connection
credentials, and verified shared-Cube source routing. These are planned, not
deployed. API, frontend, shared Cube, control-plane, and background-process
hosting remain operability unknowns. See [[Phase 3 Data Execution]].

Operational details: [[Infrastructure Topology]] and
[[Complete Cloud Operational Sign-off]].

Parent: [[Architecture MOC]]
