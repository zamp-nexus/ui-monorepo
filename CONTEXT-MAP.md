# Context Map

## Contexts

- [ZentraOS Domain](./libs/domain/CONTEXT.md) — owns the product language shared by investigations, tenancy, semantic modeling, and trust
- [Investigation](./libs/domain/investigation/CONTEXT.md) — owns the lifecycle of a traceable attempt to answer one governed business question
- [Agent Execution](./libs/domain/agent-execution/CONTEXT.md) — owns autonomous analytical work and its typed outcomes
- [Connector](./libs/domain/connector/CONTEXT.md) — owns how ZentraOS learns what is in a Tenant's data and how that data connects

## Relationships

- **Tenancy & Identity → every context**: every tenant-owned fact resolves to one internal Tenant.
- **Investigation → Agent Execution**: an Investigation delegates bounded work as Agent Executions.
- **Agent Execution → Investigation**: the Insight Agent proposes a Draft Finding from validated evidence; Investigation publication policy decides whether it becomes a Finding.
- **Agent Execution → Trust & Verification**: completed work supplies typed outcomes and evidence references for gating.
- **Trust & Verification → Investigation**: Human Approvals determine whether blocked work can continue.
- **Semantic Modeling → Investigation**: governed Semantic Metrics are the only business definitions analytical agents may query.
- **Connector → Agent Execution**: a confirmed Join Graph is the only set of joins an analytical agent may use over connector-sourced data. A discovered Source Field is not a Semantic Metric.
- **Trust & Verification → Connector**: confirming an inferred Relation is a governance decision in the same family as a Human Approval — it grants agents permission to act on something that could otherwise be wrong.
