---
id: adr-0032
title: Composer power-user commands hint the governed pipeline, never bypass it
type: adr
status: proposed
owner: unassigned
source: decision
created: 2026-08-02
updated: 2026-08-02
reviewed: 2026-08-02
confidence: verified
implementation: planned
tags: [adr, chat, composer, intake]
related: ["[[adr/0027-analytical-scope-replaces-scenario-whitelist]]", "[[adr/0028-chat-session-and-analysis-run-replace-investigation-thread-and-investigation]]"]
repo_path: apps/zentra-os/src/app/pages/chat
---

# Composer power-user commands hint the governed pipeline, never bypass it

## Decision

The Chat Session composer supports `#dataset` (sets that message's Data
Source override), `@user` (notifies a member, no permission change), and
`/skill` (names a capability directly). None of them bypass governance:
`/skill` is a hint that still routes through Intake, which still validates it
against the Organization's Analytical Scope and still creates the Analysis
Run through the normal pipeline — the User skips inference, not the check.

## Considered Options

A raw, ungoverned `/skill` dispatch — invoking a named capability directly,
no Intake step, the way Claude Code's `/` commands run directly — was
considered, since it is the more familiar power-user pattern. Rejected:
Intake is the single arbiter for every routing decision this redesign adds
(analytical scope, dataset ambiguity, non-analytical messages) specifically
so there is one governed decision point instead of several that can
disagree; a direct-dispatch `/skill` would let a User reach a capability
outside their Organization's Analytical Scope just by naming it, undermining
that guarantee for the sake of one interaction pattern.
