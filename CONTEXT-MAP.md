# Context Map

## Contexts

- [ZentraOS Domain](./libs/domain/CONTEXT.md) — owns the product language shared by investigations, tenancy, semantic modeling, and trust
- [Investigation](./libs/domain/investigation/CONTEXT.md) — owns the lifecycle of a traceable attempt to answer one governed business question
- [Agent Execution](./libs/domain/agent-execution/CONTEXT.md) — owns autonomous analytical work and its typed outcomes
- [Connector](./libs/domain/connector/CONTEXT.md) — owns how ZentraOS learns what is in a Tenant's data and how that data connects
- [Data Source](./libs/domain/data-source/CONTEXT.md) — owns uploaded and live analytical inputs, versions, and Investigation bindings

> **Unreconciled overlap.** Connector and Data Source currently describe the same
> territory from two directions. Connector is implemented; Data Source is a Phase 3
> plan with no code behind it yet. They disagree on the upload engine (ClickHouse
> versus DuckDB), on whether live sources route through Cube, and — most
> importantly — on what **Relation** means: a join between two fields in Connector,
> an uploaded file in Data Source. Do not treat either glossary as settled for that
> word until the two are merged.

## Relationships

- **Tenancy & Identity → every context**: every tenant-owned fact resolves to one internal Tenant.
- **Workspace Organization → Investigation**: Tenant-visible Groups contain Projects that organize Investigation Threads; they do not change authorization or analytical truth.
- **Investigation → Agent Execution**: an Investigation delegates bounded work as Agent Executions.
- **Agent Execution → Investigation**: the Insight Agent proposes a Draft Finding from validated evidence; Investigation publication policy decides whether it becomes a Finding.
- **Agent Execution → Trust & Verification**: completed work supplies typed outcomes and evidence references for gating.
- **Trust & Verification → Investigation**: Human Approvals determine whether blocked work can continue.
- **Semantic Modeling → Investigation**: governed Semantic Metrics are the only business definitions analytical agents may query.
- **Connector → Agent Execution**: a confirmed Join Graph is the only set of joins an analytical agent may use over connector-sourced data. A discovered Source Field is not a Semantic Metric.
- **Trust & Verification → Connector**: confirming an inferred Relation is a governance decision in the same family as a Human Approval — it grants agents permission to act on something that could otherwise be wrong.
- **Data Source → Investigation**: each Investigation binds one eligible Workspace Snapshot or Data Connection plus exact model and policy versions.
- **Data Source → Semantic Modeling**: profiles and metadata may propose relationships and metrics; Tenant approval governs them.
- **Agent Execution → Data Source**: SQL Analyst proposes a Governed Query Plan; deterministic policy authorizes and executes it.
