---
id: api-investigation
title: Investigation API
type: api
status: active
owner: unassigned
source: repository
created: 2026-07-29
updated: 2026-07-29
reviewed: 2026-07-29
confidence: verified
implementation: current
priority: critical
tags: [api, investigation, approval]
related: ["[[APIs MOC]]", "[[Investigation Trust Loop]]", "[[Forensic Observatory]]"]
depends_on: ["[[Authenticated Tenant Resolution]]", "[[Investigation Core]]"]
repo_path: apps/api/src/zentra_api/routes.py
code_refs:
  - apps/api/src/zentra_api/routes.py
  - apps/api/tests/test_api.py
---

# Investigation API

| Method | Path | Purpose | Authorization |
| --- | --- | --- | --- |
| GET | `/v1/scenarios` | List the governed questions this deployment answers | all Membership roles |
| POST | `/v1/investigations` | Start one of the listed scenarios | owner/admin/member |
| GET | `/v1/investigations/{investigation_id}` | Read current detail/replay | all Membership roles |
| POST | `/v1/investigations/{investigation_id}/approvals/{approval_id}/decision` | Approve or reject | owner/admin |

## Scenarios

Returns each scenario's key, canonical question, and neutral descriptive facts.
Served rather than compiled into the client so the question text has one home;
the launcher renders whatever this returns. The facts describe the data — region,
window, scale — and never a predicted outcome.

## Create

Request is exactly `{"scenario_key":"<key>"}` for a key the scenarios endpoint
lists — `eu_refund_spike` or `na_channel_growth`. Extra fields and any
unregistered scenario are rejected. The response is `201` with canonical question,
state, Finding, validation, pending approval, safe timeline, and delivery state.

## Read

Response includes internal Investigation ID, scenario, status, version,
evaluation attempts, timestamps, structured metrics, `artifact://` evidence,
typed validation, optional approval with `can_decide`, and deduplicated audit
timeline.

## Decide

Decision is `approve` or `reject`. Approval accepts no reason. Rejection requires
`insufficient_evidence`, `incorrect_interpretation`, `policy_mismatch`, or
`needs_more_analysis`. Exact decision replay is idempotent; conflicting or late
decisions return `409`.

## Error/privacy behavior

- `401`: invalid identity.
- `403`: insufficient role.
- `404`: invisible/cross-tenant Investigation or approval.
- `409`: invalid transition or conflicting decision.
- `422`: unsupported scenario or invalid request/reason.
- `503`: sanitized governed-metric dependency failure with no misleading result.

Parent: [[APIs MOC]]
