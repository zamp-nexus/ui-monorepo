---
id: adr-0028
title: Chat Session and Analysis Run replace Investigation Thread and Investigation
type: adr
status: proposed
owner: unassigned
source: decision
created: 2026-08-02
updated: 2026-08-02
reviewed: 2026-08-02
confidence: verified
implementation: planned
tags: [adr, chat, investigation, analysis-run]
related: ["[[Chat & Analysis Run Domain]]", "[[ZentraOS Domain]]", "[[adr/0017-linked-investigation-threads]]"]
repo_path: libs/domain/investigation
---

# Chat Session and Analysis Run replace Investigation Thread and Investigation

## Decision

Supersedes [[adr/0017-linked-investigation-threads]]. The product-facing
hierarchy becomes `Organization → Group → Chat Session → Message`, with no
Project layer and no user-facing Investigation or Thread. `Investigation
Thread` is renamed `Chat Session`; `Thread Message` is renamed `Message`;
`Investigation` is renamed `Analysis Run` and stays hidden behind the Activity
Feed and an inline approval card unless a User opens it. Analysis Run
granularity is unchanged from Investigation's: one per analytical Message,
chained to related follow-ups by `parent_analysis_run_id` rather than merged
into one run per Chat Session.

## Considered Options

Collapsing every question in a Chat Session into one continuous Analysis Run
was considered, for simplicity. Rejected: it cannot independently cost,
retry, or approval-gate individual questions inside a long-running session —
guarantees the product already depends on and that per-message granularity
preserves for free, since it is the existing Investigation lineage pattern
under a new name.

## Consequences

This is a clean-domain cutover, not a compatibility rename — see
[[adr/0030-destructive-reset-for-the-chat-and-analysis-cutover]]. Old ADRs,
API routes, and DTOs referencing the retired vocabulary are deleted outright,
not deprecated. The `libs/domain/investigation` package path has not yet been
renamed to match; that is tracked as follow-up implementation work, not part
of this decision. Intake remains the single arbiter for every routing
decision this redesign adds — see
[[adr/0032-composer-power-user-commands-hint-the-governed-pipeline]].
