---
id: adr-0023
title: Investigation Engine owns orchestration; LangGraph is not the platform controller
type: adr
status: active
owner: unassigned
source: repository
created: 2026-08-02
updated: 2026-08-02
reviewed: 2026-08-02
confidence: verified
implementation: current
priority: high
tags: [adr, investigation, orchestration, agent-execution]
related:
  - "[[Investigation Domain]]"
  - "[[Agent Execution Domain]]"
  - "[[Investigation Trust Loop]]"
  - "[[adr/0005-agents-and-execution-participants]]"
  - "[[adr/0011-complete-phase-2-as-insight-auditor-and-replay]]"
  - "[[adr/0018-postgres-leased-execution]]"
repo_path: libs/application/investigation
code_refs:
  - libs/application/investigation/src/zentra_application_investigation/ports.py
  - apps/api/src/zentra_api/pipeline.py
  - apps/api/src/zentra_api/dependencies.py
  - libs/adapters/langgraph/src/zentra_adapter_langgraph/graph.py
  - libs/domain/investigation/src/zentra_domain_investigation/investigation_board.py
  - libs/domain/investigation/src/zentra_domain_investigation/work_item.py
---

# Investigation Engine owns orchestration; LangGraph is not the platform controller

## Status

Accepted. Amends, and does not supersede, [[adr/0011-complete-phase-2-as-insight-auditor-and-replay]]
and [[adr/0018-postgres-leased-execution]]. Publication authority, the
Evaluator-Optimizer retry ceiling, and the Postgres-leased `ExecutionJob`
model are unchanged by this decision.

## Context

`InvestigationGraph` (`libs/adapters/langgraph/.../graph.py`) is a compiled,
fixed `StateGraph`: `plan → analyze → evaluate ⟲(≤3) → insight`. The
Orchestrator node writes a `tasks` ledger into graph state
(`_plan_node`); no other node reads it — the graph's edges are Python code,
not something the ledger's content can steer. There is no durable object
where facts, hypotheses, open gaps, or conflicts accumulate across steps;
completion means "the graph reached `END`," not "the question is answered."
13 of 17 declared `AgentRole`s have no runtime because there is no mechanism
by which a dynamically-planned step could invoke one — the graph only ever
calls the four roles wired into its four nodes.

The one seam this decision exploits: `InvestigationPipeline`
(`libs/application/investigation/.../ports.py`) is a `Protocol` with a single
method, `run(investigation_id, tenant_id, question, model_tier,
data_connection_id) -> PipelineResult`, implemented by exactly one class,
`LangGraphInvestigationPipeline`, bound once in
`apps/api/src/zentra_api/dependencies.py`. `ExecutionJobWorker`,
`InvestigationService`, and the lease/outbox/Work-Feed machinery call only
this protocol — none of them import `langgraph` or know a graph is involved.

## Decision

A Postgres-backed Investigation Engine — `InvestigationBoard` (durable facts,
hypotheses, knowledge gaps, conflicts, confidence) and a `WorkItem` queue
(`pending|running|waiting|blocked|completed|rejected`) — becomes the working
memory an Investigation accumulates into. An `OrchestratorLoop` application
service implements `InvestigationPipeline` in place of
`LangGraphInvestigationPipeline`, swapped at the single binding site in
`dependencies.py`. The loop observes the Board, matches open gaps to
registered agent capabilities, assigns `WorkItem`s, merges returned
artifacts back onto the Board, and decides completion — it does not execute
a fixed sequence of nodes.

`AgentPort` (`libs/domain/agent-execution/.../contracts.py`) is unchanged:
every specialist still reads its assigned `WorkItem` and the Board, produces
typed artifacts, and never calls another agent. `OrchestratorLoop` is a
deterministic service, not an Agent — it may consult an LLM for planning
proposals, but acceptance/rejection of a proposed `WorkItem` and the
completion decision are rule-based, not model output. Publication authority
stays exactly where ADR-0011 put it: deterministic Investigation policy,
never the Orchestrator, decides whether a Draft Finding becomes a Finding.

The cutover ships in stages against the same seam rather than as one
rewrite: Phase 1 introduces the Board/WorkItem/OrchestratorLoop but still
runs the existing Analyst → Evaluator → Insight sequence serially through
it (so the ≤3-attempt Evaluator-Optimizer loop and publication behavior are
unchanged while the underlying mechanism changes). Phase 2 makes the loop
reactive — continuous observe/plan/assign/merge/replan — and deletes
`InvestigationGraph` and the `langgraph` dependency from the execution path
entirely. LangGraph itself is not prohibited; it may still be used inside a
single agent's own implementation later, but never again as the platform
controller deciding what happens next across agents.

Crash recovery moves from LangGraph's checkpointer to reloading the Board
and `WorkItem`s from Postgres — consistent with ADR-0018's existing
lease-and-resume model, not a new recovery mechanism.

## Consequences

Adding a new analytical capability becomes: implement `AgentPort` + register
it, not add a graph node and rewire edges. The `tasks` ledger the
Orchestrator agent writes stops being dead state — the Board's gaps and the
registry's capability match are what a proposed `WorkItem` is actually
built from. `graph.py`, `InvestigationGraph`, and the four `agents/*.py`
node wrappers under `zentra_adapter_langgraph` become unused once Phase 2
completes; they are deleted then, not in Phase 1, so the visible pipeline
behavior does not change mid-phase. Nothing about the Evaluator's recheck,
the confidence ceilings (`confidence_ceiling`, model independence), the
Evidence Citation contract, or the Work Feed's public-summary rule
(ADR-0019) changes as a consequence of this decision.

## Verification

Phase 1: existing publication and citation test suites pass unmodified
against the new pipeline implementation; a fixture investigation still
converges within the ≤3-attempt Evaluator loop; `docs:check` is green.
Phase 2: `grep -r langgraph libs/application libs/domain apps/api` scoped to
the investigation execution path returns nothing; cancel/retry/approval
still work end to end through chat; Replay still shows every Agent
Execution.

## Phase 1 status

Implemented. `OrchestratorLoop` (`apps/api/src/zentra_api/pipeline.py`) is
bound at `dependencies.py`'s single `InvestigationPipeline` seam in place of
`LangGraphInvestigationPipeline`. It still drives the unmodified
`SqlAnalystAgent`/`EvaluatorAgent`/`InsightAgent` serially — Analyst →
Evaluator (≤`MAX_EVALUATION_ATTEMPTS`) → Insight — but every step is now a
persisted `WorkItem` against a real `InvestigationBoard`, with Facts
recorded and the seed Knowledge Gap resolved on completion. Covered by
`apps/api/tests/test_orchestrator_loop.py` (converged run, retry-then-settle,
attempt-cap-exhausted) and verified against a live Postgres instance
(migration upgrade/downgrade, RLS tenant isolation). `graph.py` /
`InvestigationGraph` / `_build_graph_factory` remain in the tree, unused by
this wiring, exactly as planned for Phase 2's deletion — not removed here.
