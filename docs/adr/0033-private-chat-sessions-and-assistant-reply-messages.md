---
id: adr-0033
title: Private Chat Sessions are creator-only; assistant replies are real messages
type: adr
status: proposed
owner: unassigned
source: decision
created: 2026-08-02
updated: 2026-08-02
reviewed: 2026-08-02
confidence: verified
implementation: planned
tags: [adr, chat, sharing, messages]
related: ["[[adr/0028-chat-session-and-analysis-run-replace-investigation-thread-and-investigation]]"]
repo_path: libs/adapters/postgres/src/zentra_adapter_postgres/schema_threads.py
---

# Private Chat Sessions are creator-only; assistant replies are real messages

## Decision

Two gaps surfaced while writing the schema cutover plan for ADR-0028, neither
of which the original grilling session settled.

**Private Chat Session sharing** (decision #7's "optional private mode" was
never given an access model): a private Chat Session is visible only to its
creator. No collaborator-invite mechanism, no per-session grant list — an
Organization admin override was considered and explicitly rejected for the
first cut. `chat_sessions` carries `created_by` and `visibility` (`'shared'`
default, `'private'`) to support this; *enforcing* it is not part of this
decision — see Consequences.

**Assistant replies are `messages` rows**, not a client-side render of an
Analysis Run's Finding. `messages.kind` gains `'assistant_reply'`, and a new
nullable `analysis_run_id` links a reply back to the Analysis Run that
produced it — set for an analytical answer, left `NULL` for the Conversational
Agent's plain reply. A `CheckConstraint` enforces that only an
`'assistant_reply'` message may carry that link.

## Considered Options

For sharing: creator + named collaborators (a real grants table, closer to a
private Slack channel) was considered and deferred, not rejected outright —
it is a legitimate next step once someone actually asks for it, but nothing
in the grilling session established that anyone has. Shipping the simpler
model now and widening later is cheap; the reverse is not.

For assistant messages: keeping analytical answers un-stored and rendered
client-side from the Analysis Run's Finding (today's actual behavior) was
considered, with only the Conversational Agent's reply getting a new kind.
Rejected for consistency — having one message shaped differently depending on
whether it happened to be analytical would mean the message stream can't be
reconstructed from `messages` alone, undermining "refreshing the browser
reconstructs the same conversation" from the original acceptance criteria.

## Consequences

`visibility = 'private'` is a column, not an enforced guarantee, as of this
ADR. Every existing row-level-security policy in this codebase is
tenant-scoped only; there is no precedent here for a user-scoped policy
layered on top. The Application & API layer plan must decide explicitly
between a second RLS policy (checking `created_by` against a session-local
setting) and an application-layer filter — and must not ship `visibility` as
a UI-only label while every tenant member can still read every row.
