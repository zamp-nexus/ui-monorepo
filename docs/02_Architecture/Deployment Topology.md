---
id: arch-deployment-topology
title: Deployment Topology
type: architecture
status: active
owner: unassigned
source: repository
created: 2026-07-29
updated: 2026-08-06
reviewed: 2026-08-06
confidence: verified
implementation: current
priority: high
tags: [deployment, infrastructure, architecture]
related:
  [
    '[[Architecture MOC]]',
    '[[Infrastructure Topology]]',
    '[[Managed Service Readiness]]',
    '[[Phase 3 Data Execution]]',
  ]
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

The public Nexus landing page is a second Vite application deployed through the
separate Vercel project `nexus-landing`. Its source lives in `apps/landing`, its
app-local deployment configuration lives in `apps/landing/vercel.json`, and its
production hostname is `landing.nexus.openzentra.com`. The Vercel project uses
`apps/landing` as its Root Directory with source files outside that directory
enabled so the landing build can consume the shared design system. The landing
page has no API or identity dependency; every product CTA crosses to the
existing authenticated application at `nexus.openzentra.com`.

The landing app additionally serves the public `/platform` route. Vercel
rewrites that deep link to the landing SPA entry point, and the landing shell
renders the technical platform narrative there: workflow boundaries, runtime
visibility, architecture, and scope. It remains a static public page and does
not expose analytical data or authenticated controls.

The first production deployment is live on the Vercel-managed project aliases.
The custom hostname is assigned to the project but remains pending external DNS
ownership verification and CNAME configuration. No Vercel project identifiers
or credentials are committed.

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
