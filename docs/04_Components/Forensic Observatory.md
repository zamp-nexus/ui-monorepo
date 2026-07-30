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

The launcher renders whatever `GET /v1/scenarios` returns — currently the
eight-order EU refund spike and the three-hundred-order NA channel growth — so
the question text lives in the API rather than being compiled into the bundle.
Each card carries neutral descriptors of its data and never a predicted outcome:
the demo shows what the system decides, not what was promised in advance.

The Investigation workspace composes the evidence spine, Finding, metric
comparisons, typed validation, audit-delivery state, and Human Approval
inspector. The timeline names the model that served each step and the rungs that
failed before it, so a degraded provider chain is visible rather than implied.

Metric rows caption their before and after with the periods the metric itself
reports. `MetricComparison` carries `previous_label` and `current_label`, filled
by the agent that chose the granularity, because nothing downstream can recover
it. They once read "June X → July Y", hardcoded from the only scenario that
existed, and captioned an October–November finding with the wrong months. Both
labels are optional: where the agent named no period — an older recording, or a
comparison that is not over time — the row shows values alone rather than a
guess.

Motion reveals already-persisted causality. Reduced-motion preferences disable
transform/layout motion while keeping content present in the accessibility tree.
Status changes use live regions and the approval heading receives focus.

The app explicitly handles missing Clerk configuration, signed-out, missing
organization, unbound membership, degraded dependencies, read-only approval,
completed, and rejected states.

Parent: [[Components MOC]]
