---
id: domain-investigation
title: Investigation Domain
type: domain
status: active
owner: unassigned
source: context-map
created: 2026-07-29
updated: 2026-07-30
reviewed: 2026-07-30
confidence: verified
implementation: current
priority: critical
tags: [domain, investigation]
aliases: [investigation]
related: ["[[Domains MOC]]", "[[Investigation Trust Loop]]", "[[Investigation Core]]"]
repo_path: libs/domain/investigation
code_refs:
  - libs/domain/investigation/CONTEXT.md
  - libs/domain/investigation/src/zentra_domain_investigation/model.py
---

# Investigation Domain

An Investigation is one traceable attempt to answer a governed business
question. The context owns lifecycle, Finding, Evaluation Attempt, Validation
Result, terminal outcomes, Evidence References, and Human Approval transition
rules.

## Lifecycle

```text
pending → running → evaluating → awaiting_approval → completed
    └────────────── cancellation/failure/rejection terminal paths
```

Evaluation increments a bounded attempt counter. A retry after the third attempt
opens `contradiction_unresolved` approval; no fourth evaluation is allowed.
Terminal states cannot transition.

A confidence outcome is bounded before it is compared to the tenant threshold:
`confidence_ceiling()` caps it by how many underlying records the agents read,
and an independence ceiling caps it by how different the two models were. The
recorded score is the lowest of the three, and `calibration_method` names which
bound applied. Agents that disagree about the sample size by more than 2x open
`contradiction_unresolved` rather than averaging. See
[[adr/0010-confidence-bounded-by-evidence]].

`EvaluationDirective` decides what a finished evaluation does: publish, retry, or
`ESCALATE` to a human. A non-converged run escalates rather than returning to
`running`, so no investigation can settle in a non-terminal state.

Validation is deterministic checks and issues, not a confidence score. Evidence
must use `artifact://`. Approval replay is idempotent only when the decision and
structured reason match.

## Phase 2 language

Phase 2 distinguishes the Insight Agent's unpublished **Draft Finding** from a
published **Finding**. Every substantive Draft Finding claim must carry a
tenant-authorized, resolvable **Evidence Citation**. A **Tombstone** explains
that cited evidence was deliberately erased without retaining its values.

A **Root Cause Claim** is not a synonym for an observed driver or association.
It remains inadmissible until a separate causal-evidence standard is accepted
and satisfied. These are planned contracts, not current implementation. See
[[Phase 2 - Insight Auditor and Replay]].

Canonical language:
[Investigation context](../../libs/domain/investigation/CONTEXT.md). Behavior:
[domain model](../../libs/domain/investigation/src/zentra_domain_investigation/model.py).

Parent: [[Domains MOC]]
