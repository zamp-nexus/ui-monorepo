---
id: adr-0038
title: Workflow Engine executes bounded custom Workflows
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
related: ["[[Agent Execution Domain]]", "[[adr/0024-agents-call-tools-through-a-governed-registry]]", "[[adr/0035-workflow-studio-v1-persists-but-does-not-execute-custom-workflows]]"]
repo_path: apps/api/src/zentra_api/workflow_execution_service.py
---

# Workflow Engine executes bounded custom Workflows

## Decision

Published organization Workflows execute through the Workflow Engine. A
Controller proposes only named edges declared by the immutable Workflow
Version; the engine enforces every route and bounded loop limit. Each Agent
receives an explicit handoff and only the registered Tools granted on its node.

Chat records the selected published version with each custom Workflow
execution. Follow-up turns keep that pinned version unless the composer selects
a different Workflow, and the Chat can retrieve its latest node-and-route trace.
The active tenant Data Connection is passed into each execution.

The available V1 Tools are governed catalog search, governed semantic query,
and tenant-scoped raw query. The system Analytics Workflow remains the only
Workflow permitted to create a Governed Finding; custom Workflows return an
ordinary response.

The trusted Analytics implementation is registered through a system-workflow
adapter, preserving its established Analysis Run lifecycle while giving Chat a
single Workflow selection seam for system and custom Workflows.

## Consequences

This supersedes ADR-0035's simulation-only boundary. Parallel fan-out, joins,
arbitrary code, external integrations, reusable Agent catalogs, and generic
approval gates remain outside V1.
