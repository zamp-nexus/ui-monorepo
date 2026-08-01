---
id: overview-current-status
title: Current Implementation Status
type: overview
status: active
owner: unassigned
source: repository
created: 2026-07-29
updated: 2026-08-01
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
- The Connector context: Data Sources (connected and uploaded), immutable Catalog
  Versions, Field Profiles bounded by explicit query budgets, and Relations
  inferred from name affinity, type compatibility, and value overlap measured at
  the source. Confidence is bounded by a sample-size and a cardinality ceiling
  with the binding ceiling recorded ([[adr/0015-inferred-relations-require-human-confirmation]]).
  Only human-confirmed Relations form the Join Graph. Connector data bypasses
  Cube ([[adr/0014-connector-data-bypasses-cube]]). CSV and Parquet uploads land
  as Data Sources in a database separate from the audit ledger, which is what
  makes cross-source relation inference possible.
- Local Docker environment and managed Neon/ClickHouse Terraform definitions.

## Product phase

Phase 2 — Insight, Auditor, and Replay — is **in progress**. The current
implementation supplies the deterministic Auditor, Human Approval,
tenant-filtered ClickHouse Replay, a registered and evaluation-gated Insight
Agent that is the sole producer of a Draft Finding, claim-level Evidence
Citations that resolve through a Tenant-authorized endpoint, and a
deterministic four-condition publication policy no Agent can override.

It also supplies split-authority Replay, Tenant-initiated evidence deletion
returning minimal Tombstones, and allowlisted observability whose baselines are
read from the audit ledger rather than a second telemetry store.

Phase 2 is not complete for two reasons, and only one of them is agent-
addressable. The authenticated API acceptance suite is partial. And the external
Replay-comprehension exercise has not been recorded — it is `ready-for-human` by
design, because an uncoached exercise run by the agent that built the product
would not be uncoached. Certification is gated on it. See
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

The Statistician and later Agents, the cost-ceiling circuit breaker, a
cross-vendor Evaluator for the premium tier, recovery for a pipeline interrupted
mid-run, generalized scheduling, production application deployment, and a release
process.

Within the Connector specifically: **Postgres persistence of Data Sources,
Catalog Versions, Relations, and Harvest Runs is not implemented**, so the API
routes exist but have no store behind them. Agent Join Graph enforcement,
connector Audit Entries and tracing, and the TPC-H accuracy harness are also
outstanding. See `ch-nexus/ui-monorepo#2` and its child tickets.

## Verification caveat

Phase 1 targeted suites, the agent eval suites, and local integrations pass
against scripted model responses.

The Connector's 138 tests (91 at the ConnectorService seam, 40 adapter, 7
contract) run entirely against in-memory fakes. **No connector
code has been executed against a live ClickHouse instance**, so real dialect
behaviour and `system.*` semantics are unverified; a manual pass is required
before any demo. The connector API routes are covered by a contract test but not
by request-level tests, because they have no persistence behind them yet. Agent behaviour against a live model is
unverified here. Existing shared foundation-package test debt is tracked
separately and must not be misreported as Phase 1 behavior.

Parent: [[Overview MOC]]
