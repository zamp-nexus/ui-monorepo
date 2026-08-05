---
id: adr-0035
title: Workflow Studio V1 persists but does not execute custom Workflows
type: adr
status: active
owner: unassigned
source: repository
created: 2026-08-05
updated: 2026-08-05
reviewed: 2026-08-05
confidence: verified
implementation: current
priority: high
tags: [adr, workflow, agent-execution, product]
related: ["[[Agent Execution Domain]]", "[[Nexus Product Experience]]", "[[adr/0026-investigation-engine-owns-orchestration]]", "[[adr/0036-workflow-engine-executes-bounded-custom-workflows]]"]
repo_path: apps/nexus
---

# Workflow Studio V1 persists but does not execute custom Workflows

## Context

The Analysis Run Engine is the trusted controller for analytical work. Users
need to inspect that loop and author their own orchestration definitions, but a
generic executor would expand the safety and recovery surface far beyond the
one-week product slice.

## Decision

Workflow Studio publishes a system-owned Default Workflow that mirrors the
current analytic trust loop. It is inspectable and cloneable, never editable.
Tenant-owned Workflows persist drafts and immutable published versions, and
publishing validates only canvas structure. Owners and Admins manage them;
all organization members may read them.

Custom Workflows have a client-side guided simulation only. They never enter
`OrchestratorLoop`, alter chat dispatch, or claim execution authority in V1.

## Consequences

The product can demonstrate visual orchestration with durable, tenant-isolated
definitions while preserving the existing governed runtime unchanged. A future
generic Agent Engine may use the same Workflow document but requires a separate
decision for execution, capability validation, recovery, and policy.
