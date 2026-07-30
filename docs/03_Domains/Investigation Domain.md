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
  - libs/domain/investigation/src/zentra_domain_investigation/draft_finding.py
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
and satisfied. See [[Phase 2 - Insight Auditor and Replay]].

### Draft Finding shape — current

The Draft Finding is now a persisted, structured record rather than a planned
contract. It has its own identity, Tenant and Investigation ownership, version,
creation metadata, bounded confidence, and an ordered set of claims. What used
to be readable only by a person reading prose is now data:

- **Claim kind** — every claim is `observed` or `interpretation`. The
  distinction a reviewer most needs is the one narrative carried least
  reliably.
- **Claim position** — contiguous from zero, enforced in the domain and by a
  unique constraint. A gap means a claim was lost between Insight and the
  reader, and the assembly fails rather than silently reordering.
- **Contradiction** — typed data with a `resolved` flag, so an open
  disagreement can be *rendered* as a state instead of buried in a sentence.
- **Root cause state** — a single-member enum, `unresolved`. Modelled as a
  state rather than a missing field precisely so the product can say "root
  cause unresolved" out loud.
- **Citation identifiers** — carried per claim, empty until Evidence Citations
  exist, so adding them is a write rather than another migration.

Nothing here decides whether a draft publishes; that is the Investigation's
deterministic policy, deliberately elsewhere. Insight does not yet produce
these — the shape lands before its producer does.

The Phase 1 narrative `Finding` is untouched and still lives in
`investigations.state`. An Investigation that ran before Insight has a
`finding` and no draft, and every surface says so rather than presenting
narrative as claims that could be individually cited.

Canonical language:
[Investigation context](../../libs/domain/investigation/CONTEXT.md). Behavior:
[domain model](../../libs/domain/investigation/src/zentra_domain_investigation/model.py).

Parent: [[Domains MOC]]
