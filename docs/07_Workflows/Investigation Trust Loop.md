---
id: workflow-investigation-trust-loop
title: Investigation Trust Loop
type: workflow
status: active
owner: unassigned
source: repository
created: 2026-07-29
updated: 2026-07-30
reviewed: 2026-07-30
confidence: verified
implementation: current
priority: critical
tags: [workflow, investigation, approval]
related: ["[[Workflows MOC]]", "[[Investigation Domain]]", "[[Investigation API]]"]
depends_on: ["[[Authenticated Tenant Resolution]]", "[[Cube Semantic Model]]", "[[Audit Outbox Delivery]]"]
repo_path: libs/application/investigation
code_refs:
  - libs/application/investigation/src/zentra_application_investigation/service.py
  - libs/domain/investigation/src/zentra_domain_investigation/model.py
---

# Investigation Trust Loop

## Trigger

An authorized User submits `eu_refund_spike`. The server fixes the canonical
question.

## Sequence

1. Resolve verified internal actor and Tenant.
2. Create `pending`, transition to `running`, and return. The request is not
   held open for the length of the pipeline.
3. The Orchestrator resolves the enabled Agents from the registry and refuses
   if a required role is absent.
4. The SQL Analyst builds one governed query, executes it, and reports the
   movement with a self-reported confidence and the number of underlying
   records the figures rest on.
5. The Evaluator builds its own query from the question alone, executes it
   independently, and compares. Its confidence is capped at the Analyst's, and
   it counts the sample independently rather than copying the figure.
6. A failed recheck returns to step 4 with the disagreement attached. The loop
   exits hard at three attempts whatever the score.
7. The Orchestrator synthesises a Finding and names any contradiction.
8. Each Agent Execution is persisted and enqueued to the audit outbox as it
   completes, so an interrupted Investigation is replayable up to that point.
9. The confidence is bounded before it meets the Tenant threshold. A model may
   be less confident than the evidence supports, never more: the recorded score
   is the lowest of the model's own, a ceiling set by the smaller of the two
   sample counts, and a ceiling set by how independent the recheck actually was
   — `NONE` when one model served both agents, `PARTIAL` within a model family,
   `FULL` across families. `calibration_method` names whichever bound applied,
   so Replay shows why a number was lowered rather than only that it was. Sample
   counts diverging by more than 2x gate as a contradiction. See
   [[adr/0010-confidence-bounded-by-evidence]].
10. Transition to `evaluating`, then either `completed` when the bounded
    confidence clears the Tenant threshold and the recheck converged, or
    `awaiting_approval` with `low_confidence` or `contradiction_unresolved`.
11. Owner/admin approves to `completed` or rejects with structured reason to
    `rejected`. Exact decision replay is idempotent.

Result rows never enter the audit ledger or travel between Agents. They live in
`agent_executions.output` and are reachable only through the `artifact://`
pointer the ledger carries.

## Phase 2 change

The sequence above is current behavior. Phase 2 replaces step 7 with a
separately registered Insight Agent that produces a Draft Finding. Publication
then additionally requires complete, resolvable Evidence Citations. Replay
combines ClickHouse process truth with authorized evidence artifacts, and
deleted evidence resolves to Tombstones. See
[[Phase 2 - Insight Auditor and Replay]].

Parent: [[Workflows MOC]]
