---
id: domain-agent-execution
title: Agent Execution Domain
type: domain
status: active
owner: unassigned
source: context-map
created: 2026-07-29
updated: 2026-07-29
reviewed: 2026-07-29
confidence: verified
implementation: current
priority: high
tags: [domain, agent-execution]
aliases: [agent-execution, Agent Port]
related: ["[[Domains MOC]]", "[[Investigation Domain]]", "[[adr/0005-agents-and-execution-participants]]"]
repo_path: libs/domain/agent-execution
code_refs:
  - libs/domain/agent-execution/CONTEXT.md
  - libs/domain/agent-execution/src/zentra_domain_agent_execution/contracts.py
---

# Agent Execution Domain

This context owns the contract for future autonomous analytical workers and one
bounded Agent Execution within an Investigation and Tenant.

The Agent Port declares structured input/output schemas, evidence, role-specific
Outcome Signal, tools, context budget, fallback, and evaluation-suite reference.
An outcome is either calibrated confidence or explicit validation; deterministic
work must not fabricate confidence.

Fourteen autonomous roles may eventually be registered. Auditor is a
deterministic event subscriber and Human Reviewer is a User at a Human Approval
gate; neither is an Agent.

## Current boundary

The contracts exist, but the Agent registry is empty and no Agent implementation
or Agent Execution participates in Phase 1A.

Canonical language:
[Agent Execution context](../../libs/domain/agent-execution/CONTEXT.md).

Parent: [[Domains MOC]]
