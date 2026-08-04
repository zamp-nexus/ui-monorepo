---
id: adr-0034
title: Inline Analysis Run UI supersedes Investigation and Hidden Activity
type: adr
status: proposed
owner: unassigned
source: decision
created: 2026-08-04
updated: 2026-08-04
reviewed: 2026-08-04
confidence: verified
implementation: current
tags: [adr, chat, analysis-run, investigation]
related: ["[[Analysis Run Domain]]", "[[Nexus Domain]]", "[[adr/0006-metadata-only-audit-ledger]]", "[[adr/0028-chat-session-and-analysis-run-replace-investigation-thread-and-investigation]]", "[[adr/0029-activity-feed-replaces-the-work-feed]]"]
repo_path: libs/domain/analysis_run
---

# Inline Analysis Run UI supersedes Investigation and Hidden Activity

## Decision

This ADR supersedes specific clauses in three prior decisions to reflect the shipped end-state of the Analysis Run UI cutover:

1. **Supersedes ADR-0028's hidden activity clause**: ADR-0028 stated that an Analysis Run "stays hidden behind the Activity Feed... unless a User opens it." The Analysis Run activity is now always inline in the Chat UI and never hidden behind a separate panel.
2. **Supersedes ADR-0029's Activity Feed panel design**: The hidden Activity Feed panel is completely deleted, not just relocated. All citations, outcomes, human approvals, and agent activities render directly within the inline chat message flow.
3. **Narrows ADR-0006's audit-content restriction**: ADR-0006 restricts what reaches the client. This is explicitly narrowed: Agent-authored natural-language text (`summary`, `reasoning`) *is* allowed to reach the client and be rendered inline. However, the core of ADR-0006 remains: raw Tool arguments, Tool result content, and row data still never reach the client.

## Considered Options

Retaining the side panel for detailed agent activity was considered. Rejected: it fragmented the user's attention and divorced the reasoning from the message it produced. Moving everything inline forces a cleaner, more concise presentation of only what matters (summary, reasoning, citations, and outcomes) directly where the user is already looking.

## Consequences

- The "Investigation" vocabulary is fully retired from the user-facing product, APIs, and domain models, completely replaced by "Analysis Run".
- The UI is simpler, with no standalone Analysis Run page or side panels.
- Agent event payloads to the client now include the `reasoning` string, but continue to omit raw tool data.
- The `libs/domain/analysis_run` package path and related paths have been renamed to `libs/domain/analysis_run` to match this reality.
