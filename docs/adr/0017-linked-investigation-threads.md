---
id: adr-0017
title: Investigation Threads use linear immutable attempts
type: adr
status: deprecated
owner: unassigned
source: repository
created: 2026-08-01
updated: 2026-08-02
reviewed: 2026-08-02
confidence: verified
implementation: deprecated
tags: [adr, investigation, threads]
related: ["[[Analysis Run Domain]]", "[[Investigation Thread API]]"]
repo_path: libs/domain/analysis_run
---

# Investigation Threads use linear immutable attempts

## Decision

A Thread is presentation and context; each analytical attempt remains an
immutable Investigation. Follow-ups form one chain through
`parent_investigation_id`, retries identify the replaced attempt through
`retry_of_investigation_id`, and `thread_sequence` establishes order. Context
may include prior questions, published Findings, approved claims, and authorized
citation IDs only.

## Consequences

Drafts, Work Feed narration, prompts, reasoning, SQL, raw rows, and erased
evidence never become follow-up input. Ambiguity persists a clarification on an
active Thread without creating work. See [[Visualization and Work Feed API]] and
[[Investigation Trust Loop]].
