---
id: overview-product-boundaries
title: Product Boundaries
type: overview
status: active
owner: unassigned
source: repository
created: 2026-07-29
updated: 2026-07-29
reviewed: 2026-07-29
confidence: verified
implementation: current
priority: critical
tags: [product, boundaries, phase-1a]
related: ["[[Overview MOC]]", "[[Current Implementation Status]]", "[[Investigation Trust Loop]]"]
repo_path: README.md
code_refs: [README.md, apps/api/src/zentra_api/routes.py]
---

# Product Boundaries

## Current product

ZentraOS converts a governed business question into a tenant-isolated,
evidence-backed Investigation. Phase 1A supports only
`eu_refund_spike`: “Why did EU refunds increase from June to July 2026?”

The workflow queries governed Cube metrics, validates deterministic values,
requires Human Approval because the sample is small, and exposes a safe replay
timeline. It never presents model confidence or hidden reasoning.

## Current users

Users participate through a Tenant Membership:

- owner/admin/member can create and view an Investigation;
- viewer can view but not create;
- owner/admin can approve or reject a Human Approval.

## Deliberately outside the boundary

- Arbitrary questions, uploads, customer datasets, and generalized connectors.
- Model-backed agents, LangGraph orchestration, or E2B sandbox execution.
- Agent registry management or enabled Agent rows.
- Investigation listing, streaming, full replay, or cancellation APIs.
- Production deployment automation and cloud operational sign-off.

## Product promises

Tenant identity is derived from verified provider context, analytical measures
come from governed semantics, evidence uses `artifact://` references, and audit
records exclude prompts and raw customer data.

Parent: [[Overview MOC]]
