---
id: domain-agent-execution
title: Agent Execution Domain
type: domain
status: active
owner: unassigned
source: context-map
created: 2026-07-29
updated: 2026-07-30
reviewed: 2026-07-30
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

Three of the fourteen roles are implemented — Orchestrator, SQL Analyst, and
Evaluator — and participate in every Investigation. Each is a registry row that
the Orchestrator resolves at investigation start; a role with no enabled,
eval-passing Agent causes the Investigation to refuse rather than proceed.

Both the SQL Analyst and the Evaluator report `sample_size` alongside their
confidence — how many underlying records the figures rest on, read from a count
measure in their own result. Reading a count is extraction; scoring one's own
confidence is not, which is why the application bounds the latter by the former.

`IndependenceLevel` grades a recheck by what actually served each agent, not by
the routing table: `NONE` when one model served both, `PARTIAL` within a model
family, `FULL` across families. Fallback can collapse a chain onto one provider,
so the grade is taken from `usage.model` on what executed.

The governed catalog carries the permitted **values** of low-cardinality string
dimensions, not only member names. Without them an agent filtering
`North America` against data storing `NA` receives zero rows and no error.

The Semantic Layer Port is the only capability in the tree that reaches data.
No raw-SQL port exists for an Agent to be granted, which is what makes the SQL
Analyst's inability to see raw tables structural rather than instructed.

## Phase 2 boundary

Phase 2 adds the Insight Agent as the fourth implemented autonomous role. It is
separately registered and evaluated, produces a Draft Finding from validated
upstream evidence, and never guarantees a Root Cause Claim. The Orchestrator
continues to delegate and arbitrate but stops synthesizing Findings. The
Statistician remains deferred. See
[[adr/0011-complete-phase-2-as-insight-auditor-and-replay]].

Canonical language:
[Agent Execution context](../../libs/domain/agent-execution/CONTEXT.md).

Parent: [[Domains MOC]]
