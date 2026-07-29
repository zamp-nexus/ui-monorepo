---
id: component-forensic-observatory
title: Forensic Observatory
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
tags: [component, frontend, react]
aliases: [zentra-os, frontend]
related: ["[[Components MOC]]", "[[User Workflows]]", "[[Investigation API]]"]
depends_on: ["[[FastAPI Service]]", "[[TypeScript Foundation Library Catalog]]"]
repo_path: apps/zentra-os
code_refs:
  - apps/zentra-os/src/app/app.tsx
  - apps/zentra-os/src/app/app.module.scss
  - apps/zentra-os/src/app/providers.tsx
---

# Forensic Observatory

The React/Vite application is the authenticated product UI. It uses Clerk,
foundation authentication/authorization, the internal design system, React
Query, React Router, and Motion.

The launcher exposes only the governed EU refund-spike scenario. The
Investigation workspace composes the evidence spine, Finding, metric
comparisons, typed validation, audit-delivery state, and Human Approval
inspector.

Motion reveals already-persisted causality. Reduced-motion preferences disable
transform/layout motion while keeping content present in the accessibility tree.
Status changes use live regions and the approval heading receives focus.

The app explicitly handles missing Clerk configuration, signed-out, missing
organization, unbound membership, degraded dependencies, read-only approval,
completed, and rejected states.

Parent: [[Components MOC]]
