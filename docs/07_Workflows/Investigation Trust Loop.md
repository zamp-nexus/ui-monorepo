---
id: workflow-investigation-trust-loop
title: Investigation Trust Loop
type: workflow
status: active
owner: unassigned
source: repository
created: 2026-07-29
updated: 2026-07-29
reviewed: 2026-07-29
confidence: verified
implementation: current
priority: critical
tags: [workflow, investigation, approval]
related: ["[[Workflows MOC]]", "[[Investigation Domain]]", "[[Investigation API]]"]
depends_on: ["[[Authenticated Tenant Resolution]]", "[[Cube Semantic Model]]", "[[Audit Outbox Delivery]]"]
repo_path: libs/application/investigation
code_refs:
  - libs/application/investigation/src/zentra_application_investigation/service.py
  - libs/domain/investigation/src/zentra_domain_investigation/model.py
---

# Investigation Trust Loop

## Trigger

An authorized User submits `eu_refund_spike`. The server fixes the canonical
question.

## Sequence

1. Resolve verified internal actor and Tenant.
2. Query Cube for June/July EU metrics and July refund reasons.
3. Reject dependency mismatch without creating a misleading Investigation.
4. Create `pending`, transition to `running`, then `evaluating`.
5. Record deterministic validation and Finding with `artifact://` evidence.
6. Transition to `awaiting_approval` because tenant policy rejects autonomous
   completion for four orders per month.
7. Persist Investigation, pending approval, and audit events atomically.
8. Attempt ClickHouse delivery after commit; expose pending delivery safely.
9. Owner/admin approves to `completed` or rejects with structured reason to
   `rejected`.
10. Persist and deliver terminal audit events; exact decision replay is
    idempotent.

No step is represented as an Agent Execution. No synthetic delay, confidence,
prompt, or hidden reasoning is introduced.

Parent: [[Workflows MOC]]
