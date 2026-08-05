---
id: adr-0039
title: Intake selects published Workflows under policy
type: adr
status: active
owner: unassigned
source: repository
created: 2026-08-05
updated: 2026-08-05
reviewed: 2026-08-05
confidence: verified
implementation: current
tags: [adr, workflow, intake, routing, policy]
related: ["[[Agent Execution Domain]]", "[[adr/0036-workflow-engine-executes-bounded-custom-workflows]]"]
repo_path: apps/api/src/zentra_api/workflow_selection_service.py
---

# Intake selects published Workflows under policy

For each Chat message, Intake may recommend one organization-scoped, published
Workflow Version from the Auto-enabled candidate list. The application validates
the recommendation against that list before execution; an invalid recommendation
or no recommendation falls back to the system Analytics Workflow.

Workflow authors provide purpose, tags, and example requests before enabling
Auto. A manual Workflow choice applies only to one message. Custom Workflows
return ordinary replies; the system Analytics Workflow remains the only path
that can publish a governed Finding.
