---
id: adr-0036
title: Sequence graph layout is a client concern, and the API adds no new Work Feed event kinds
type: adr
status: active
owner: unassigned
source: repository
created: 2026-08-02
updated: 2026-08-02
reviewed: 2026-08-02
confidence: verified
implementation: current
priority: low
tags: [adr, sequence, frontend, react-flow, work-feed]
related:
  - "[[Sequence Domain]]"
  - "[[adr/0019-public-work-feed]]"
depends_on: []
repo_path: apps/nexus/src/app/pages/sequences
code_refs:
  - apps/nexus/src/app/pages/sequences/graph-layout.ts
  - apps/api/src/zentra_api/sequence_routes.py
  - apps/api/src/zentra_api/sequence_schemas.py
  - apps/nexus/src/app/pages/sequences/sequence-detail-page.tsx
---

# Sequence graph layout is a client concern, and the API adds no new Work Feed event kinds

## Status

Accepted.

## Context

Sequence Phase 4 (the Sequence page) renders a Sequence's persisted lineage
— Raw Table, Sequence Steps, Prepared Tables, failed Sequence Runs — as an
interactive React Flow canvas, and grows that canvas as Data Steward acts in
the Sequence's scoped Investigation Thread. Two design questions came up
building it:

1. Where does each node's on-screen position come from?
2. How does the canvas learn a new Sequence Step just landed?

## Decision

**Layout is computed entirely on the client, from the graph response, and
the API never emits coordinates.** `GET /v1/sequences/{id}` returns only
persisted state — Raw Table, Steps, Prepared Tables, failed Runs — with no
`x`/`y` anywhere in the contract. `graph-layout.ts`'s `layoutSequenceGraph`
turns that into React Flow nodes/edges deterministically: depth is lineage
distance from the Raw Table, ordering within a depth is by `created_at`
(then id) for stability, and a failed Run is positioned via a *derived*
anchor (the latest Prepared Table before the failure, since `sequence_runs`
records no input reference — nothing writes one yet).

**No new `WorkFeedEventKind` is added for Sequence.** The canvas grows by
reusing the existing `useThreadEvents` SSE hook against the Sequence's own
thread; on *any* event for that thread, the detail page invalidates the
`['sequence', id]` query and refetches the graph. React Flow reconciles by
node id, so an unchanged node is not remounted.

## Consequences

- Coordinates are not part of the versioned public API contract
  (`docs/05_APIs/zentraos-openapi.json`), so a future layout change (a
  collapsed group, a different algorithm) is a frontend-only change with no
  contract migration.
- The canvas has no hidden client-side state that could drift from what
  actually happened — user story 12 of the Phase 4 PRD (issue #46) is a
  property of this design, not something tested in after the fact.
- The Sequence page currently cannot distinguish *why* it refetched — any
  event on the thread triggers the same graph refetch, whether or not that
  event actually changed the graph. This is deliberately imprecise: as of
  this phase, nothing exists yet that emits Sequence-specific events (Data
  Steward, Phase 2, is unbuilt), so there is nothing to discriminate on.
  When Phase 2 lands, the natural follow-up is a `sequence.*` family of
  `WorkFeedEventKind`s — an Investigation-context decision made then, not
  pre-empted here.
- Failed-run node position is a display heuristic, not recorded lineage
  (see `anchor_for_failed_run` in `zentra_application_sequence.lineage`).
  It is correct for the linear, one-step-at-a-time execution Phase 2's Data
  Steward is expected to have; a Sequence Step ever gaining a genuine
  recorded input reference on failure would be an additive schema change
  the derivation could then be replaced by.

## Alternatives considered

**Persist node coordinates alongside each Sequence Step or Prepared Table.**
Rejected: freezes a UI decision into the domain's persisted state and the
public API contract for a feature (Sequence) whose graph-shape conventions
this phase is establishing for the first time; also gives the API a reason
to know about "nodes" and "edges" at all, which are frontend vocabulary.

**Add `sequence.step_appended` / `sequence.run_failed` Work Feed event
kinds now, ahead of Data Steward.** Rejected: `ThreadEvent`'s schema is a
versioned public contract (`docs/05_APIs/schemas/work-feed-event.schema.json`),
asserted byte-for-byte by `test_public_feed_contract_cannot_represent_sensitive_surfaces`
and friends. Adding a kind nothing can emit yet is dead contract surface,
and the Investigation context — not Sequence Phase 4 — owns that decision.
