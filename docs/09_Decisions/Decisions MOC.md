---
id: moc-decisions
title: Decisions MOC
type: moc
status: active
owner: unassigned
source: repository
created: 2026-07-29
updated: 2026-08-01
reviewed: 2026-08-01
confidence: verified
priority: high
tags: [adr, decisions, index]
related: ["[[Nexus Knowledge Base]]", "[[Hexagonal Modular Monolith]]"]
repo_path: docs/adr
---

# Decisions

Canonical ADRs remain in `docs/adr/`:

- [[adr/0001-hexagonal-modular-monolith]]
- [[adr/0002-split-transactional-and-audit-storage]]
- [[adr/0003-provider-neutral-multi-tenant-identity]]
- [[adr/0004-four-membership-roles]]
- [[adr/0005-agents-and-execution-participants]]
- [[adr/0006-metadata-only-audit-ledger]]
- [[adr/0007-transactional-audit-outbox]]
- [[adr/0009-tiered-model-provider-routing]]
- [[adr/0010-confidence-bounded-by-evidence]]
- [[adr/0011-complete-phase-2-as-insight-auditor-and-replay]]
- [[adr/0012-complete-phase-3-as-governed-bring-your-own-data]]
- [[adr/0014-connector-data-bypasses-cube]] (superseded by 0016)
- [[adr/0015-inferred-relations-require-human-confirmation]]
- [[adr/0016-cube-is-the-single-tenant-scoped-analytical-gateway]]
- [[adr/0017-linked-investigation-threads]]
- [[adr/0018-postgres-leased-execution]]
- [[adr/0019-public-work-feed]]
- [[adr/0020-thesys-terminal-presentation]]
- [[adr/0021-visualization-brief-factual-separation]]
- [[adr/0022-sequence-step-execution-is-distinct-from-phase-3-query-execution]] (amends 0012)
- [[adr/0023-free-text-questions-replace-governed-scenarios]]
- [[adr/0024-agents-call-tools-through-a-governed-registry]]
- [[adr/0025-the-sql-analyst-is-renamed-the-cube-analyst]]
- [[adr/0026-investigation-engine-owns-orchestration]] (amends 0011, 0018)
- [[adr/0027-analytical-scope-replaces-scenario-whitelist]] (amends Investigation Domain routing invariant)
- [[adr/0023-sequence-graph-layout-is-a-client-concern]]
- [[adr/0023-source-table-row-browsing-bypasses-governed-query]]
- [[adr/0028-chat-session-and-analysis-run-replace-investigation-thread-and-investigation]]
- [[adr/0029-activity-feed-replaces-the-work-feed]]
- [[adr/0030-destructive-reset-for-the-chat-and-analysis-cutover]]
- [[adr/0031-langfuse-on-the-existing-safe-telemetry-pipe]]
- [[adr/0032-composer-power-user-commands-hint-the-governed-pipeline]]
- [[adr/0033-private-chat-sessions-and-assistant-reply-messages]]
- [[adr/0034-supersede-investigation-and-hidden-analysis]]
- [[adr/0035-workflow-studio-v1-persists-but-does-not-execute-custom-workflows]]

## Governance

An accepted ADR is immutable except for metadata or status corrections. A new
decision supersedes an old one and both notes link to each other. Create an ADR
only for a hard-to-reverse choice with real alternatives and meaningful future
surprise.

Parent: [[Nexus Knowledge Base]]
