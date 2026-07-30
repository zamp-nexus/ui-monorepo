---
id: overview-current-status
title: Current Implementation Status
type: overview
status: active
owner: unassigned
source: repository
created: 2026-07-29
updated: 2026-07-30
reviewed: 2026-07-30
confidence: verified
implementation: current
priority: high
tags: [status, phase-1]
related: ["[[Overview MOC]]", "[[Known Unknowns]]", "[[Managed Service Readiness]]"]
repo_path: README.md
code_refs: [README.md, libs/domain/investigation, apps/zentra-os]
---

# Current Implementation Status

## Implemented

- Phase 0 modular-monolith foundation and architectural boundary enforcement.
- Provider-neutral identity bindings and four-role Tenant Memberships.
- Postgres RLS, migrations, Investigation persistence, Human Approval locking,
  and transactional audit outbox.
- ClickHouse metadata-only audit ledger and replay deduplication.
- Eight Cube-governed commerce metrics and two deterministic seeds: the
  eight-order EU refund spike and the three-hundred-order NA channel growth.
- Phase 1A Investigation lifecycle, API, and Forensic Observatory.
- Phase 1 agent trust loop: Orchestrator, SQL Analyst, and Evaluator as
  `AgentPort` implementations over a LangGraph graph, with the
  Evaluator-Optimizer loop exiting hard at three attempts.
- Confidence bounded by evidence before it meets the Tenant threshold — a
  sample-size ceiling and a three-level independence ceiling, with
  `calibration_method` naming whichever bound applied
  ([[adr/0010-confidence-bounded-by-evidence]]). Both outcomes are reachable:
  the EU scenario gates, the NA scenario publishes without review.
- Agent Executions persisted per step with token, cost, and model attribution,
  and delivered to the audit ledger as metadata and `artifact://` pointers.
- Deterministic agent eval suites gating `agent_registry.eval_status`.
- Tiered model provider routing with per-role fallback chains, a per-provider
  circuit breaker, client-side schema validation, and an independence grade taken
  from what actually served each agent rather than from the routing table.
- Recorded cassettes of live runs under `evals/cassettes/`, replayed by
  `nx run evals:replay` to re-verify calibration offline at no cost.
- OpenTelemetry trace correlation and configurable OTLP export.
- Local Docker environment and managed Neon/ClickHouse Terraform definitions.

## Product phase

Phase 2 — Insight, Auditor, and Replay — is **in progress**. The current
implementation already supplies the deterministic Auditor, Human Approval,
tenant-filtered ClickHouse Replay, and an Orchestrator-synthesized Finding.

Phase 2 is not complete because Insight is not an independent registered Agent,
Finding claims expose opaque artifact pointers rather than resolvable Evidence
Citations, evidence deletion has no Tombstone workflow, and no external
Replay-comprehension exercise has been recorded. See
[[Phase 2 - Insight Auditor and Replay]] and
[[adr/0011-complete-phase-2-as-insight-auditor-and-replay]].

## Configured but not operationally signed off

Clerk, Neon, ClickHouse Cloud, Langfuse, E2B, and every model provider
(Anthropic, OpenAI, Gemini, NVIDIA, Groq, Cerebras, OpenRouter) require
externally supplied credentials. E2B remains configuration validation only.

The agents **have** been exercised against live models on both tiers, and the
recordings are committed. Gemini's free API tier caps at 20 requests per day —
about three investigations — after which the free chain collapses onto one
provider and its independence grade drops to `NONE`.

## Not implemented

The Insight Agent, resolvable claim-level Evidence Citations, evidence-deletion
Tombstones, the Statistician and later Agents, the cost-ceiling circuit breaker,
a cross-vendor Evaluator for the premium tier, recovery for a pipeline
interrupted mid-run, generalized scheduling, arbitrary datasets/questions,
production application deployment, and a release process.

## Verification caveat

Phase 1 targeted suites, the agent eval suites, and local integrations pass
against scripted model responses. Agent behaviour against a live model is
unverified here. Existing shared foundation-package test debt is tracked
separately and must not be misreported as Phase 1 behavior.

Parent: [[Overview MOC]]
