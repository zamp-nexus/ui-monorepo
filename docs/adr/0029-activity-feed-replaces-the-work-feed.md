---
id: adr-0029
title: Activity Feed replaces the Work Feed; a pending approval is the one thing shown inline
type: adr
status: proposed
owner: unassigned
source: decision
created: 2026-08-02
updated: 2026-08-02
reviewed: 2026-08-02
confidence: verified
implementation: planned
tags: [adr, chat, sse, events, approval]
related: ["[[Analysis Run Domain]]", "[[adr/0019-public-work-feed]]", "[[adr/0028-chat-session-and-analysis-run-replace-investigation-thread-and-investigation]]"]
repo_path: libs/domain/analysis_run/src/zentra_domain_analysis_run/work_feed.py
---

# Activity Feed replaces the Work Feed; a pending approval is the one thing shown inline

## Decision

Supersedes [[adr/0019-public-work-feed]]. `Work Feed` is renamed `Activity
Feed`; `Thread Event` is renamed `Chat Activity Event`. Delivery mechanics are
unchanged — atomically allocated sequence, resumable SSE, backlog-then-tail,
15-second heartbeat, dedupe by sequence or event UUID — only the public name
and the surface it drives change. Everything the Activity Feed carries stays
hidden behind an opt-in Activity Inspector panel by default, with one
deliberate exception: a Human Approval gate blocking an Analysis Run surfaces
as an inline card directly in the Chat Session, not inside the panel.

## Considered Options

Keeping approval fully inside the hidden Activity panel, consistent with
"everything hidden by default," was considered. Rejected: an approval gate is
the one piece of Analysis Run state that requires the User to act rather than
just observe — hiding it behind an opt-in panel risks a Chat Session silently
stalling with nobody aware it is waiting on them.

## Consequences

The Activity Inspector renders as a resizable right panel on desktop (minimum
width enforced on both the conversation and the panel) and a bottom drawer on
mobile — not a modal, not a separate route, so the composer and conversation
stay usable while it is open.
