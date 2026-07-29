---
id: question-known-unknowns
title: Known Unknowns
type: open-question
status: active
owner: unassigned
source: repository
created: 2026-07-29
updated: 2026-07-29
reviewed: 2026-07-29
confidence: inferred
implementation: unknown
priority: high
tags: [open-question, risk, roadmap]
related: ["[[References MOC]]", "[[Current Implementation Status]]", "[[Managed Service Readiness]]"]
repo_path: .
---

# Known Unknowns

These gaps are not resolved by repository evidence:

| Unknown | Evidence needed | Durable destination |
| --- | --- | --- |
| Component/team ownership | CODEOWNERS or accepted ownership registry | note metadata |
| Release/versioning strategy | accepted process and automation | release/runbook/ADR |
| Production application hosting | platform decision and deployed resources | architecture/runbook |
| Deployment promotion and rollback | CI/CD implementation and operator policy | workflow/runbook |
| Secret management | selected platform and access model | operations/runbook |
| Neon/ClickHouse connectivity | credentialed runtime checks | readiness record |
| Langfuse Tenant trace | credentialed manual trace | readiness record |
| Incident system/on-call process | organizational decision | incident/runbook governance |
| Agent runtime/scheduling | implemented Phase 1+ design | domain/component/ADR |

The repository also contains shared foundation test debt that is separate from
Phase 1A targeted verification. Do not convert this observation into invented
scope or ownership.

Resolve a row only with primary evidence and link the resulting durable note.

Parent: [[References MOC]]
