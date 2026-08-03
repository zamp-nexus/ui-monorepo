# Context Map

## Contexts

- [ZentraOS Domain](./libs/domain/CONTEXT.md) — owns the product language shared by chat, analysis, tenancy, semantic modeling, and trust
- [Investigation](./libs/domain/investigation/CONTEXT.md) — owns the lifecycle of a Chat Session and the Analysis Runs it accumulates; still at this path pending the package rename (see [[adr/0028-chat-session-and-analysis-run-replace-investigation-thread-and-investigation]])
- [Agent Execution](./libs/domain/agent-execution/CONTEXT.md) — owns autonomous analytical work and its typed outcomes
- [Connector](./libs/domain/connector/CONTEXT.md) — owns how ZentraOS learns what is in a Tenant's data and how that data connects
- [Data Source](./libs/domain/data-source/CONTEXT.md) — owns uploaded and live analytical inputs, versions, and Analysis Run bindings
- [Sequence](./libs/domain/sequence/CONTEXT.md) — owns the versioned graph of typed transform steps that turns a raw table into a final, model-ready table

> **Partially reconciled overlap.** Connector and Data Source still describe the
> same territory from two directions — Connector is implemented; Data Source is
> a Phase 3 plan with no code behind it yet — and still disagree on whether Data
> Source's own query-execution path (DuckDB, per the Phase 3 plan) versus Cube
> (ADR-0016) is authoritative. The **Relation** collision is resolved: Connector
> keeps Relation meaning an inferred join; Data Source's uploaded-file concept is
> renamed Dataset Table. Sequence resolves the transform-execution engine
> question for its own scope (chDB, not DuckDB) but does not resolve Data
> Source's separate query-execution debate.

> **Tenant → Organization, partially reconciled.** The ZentraOS Domain and
> Investigation contexts now use **Organization** as the canonical term for a
> customer, per [[adr/0028-chat-session-and-analysis-run-replace-investigation-thread-and-investigation]].
> Connector, Sequence, Data Source, and Agent Execution still say **Tenant** —
> that rename was out of scope for the chat migration and is unreconciled,
> not a second meaning. Treat "Tenant" and "Organization" as the same concept
> until those contexts are revisited.

## Relationships

- **Tenancy & Identity → every context**: every tenant-owned fact resolves to one internal Organization.
- **Workspace Organization → Chat**: Organization-visible Groups directly contain Chat Sessions; there is no Project layer and no nested Groups. Groups do not change authorization or analytical truth.
- **Chat Session → Analysis Run**: a Chat Session preserves an append-only Message stream while each analytical message may resolve to a separate, traceable Analysis Run, chained to prior related runs by parent lineage rather than merged into one.
- **Analysis Run → Agent Execution**: an Analysis Run delegates bounded work as Agent Executions.
- **Agent Execution → Analysis Run**: the Insight Agent proposes a Draft Finding from validated evidence; Analysis Run publication policy decides whether it becomes a Finding.
- **Agent Execution → Trust & Verification**: completed work supplies typed outcomes and evidence references for gating.
- **Trust & Verification → Analysis Run**: Human Approvals determine whether blocked work can continue; approval is the one piece of Analysis Run state shown inline in the Chat Session rather than hidden behind Activity.
- **Semantic Modeling → Analysis Run**: governed Semantic Metrics are the only business definitions analytical agents may query.
- **Connector → Agent Execution**: a confirmed Join Graph is the only set of joins an analytical agent may use over connector-sourced data. A discovered Source Field is not a Semantic Metric.
- **Trust & Verification → Connector**: confirming an inferred Relation is a governance decision in the same family as a Human Approval — it grants agents permission to act on something that could otherwise be wrong.
- **Data Source → Analysis Run**: each Analysis Run binds one eligible Workspace Snapshot or Data Connection plus exact model and policy versions; Intake resolves which Data Source when a Chat Session has more than one available.
- **Data Source → Semantic Modeling**: profiles and metadata may propose relationships and metrics; Organization approval governs them.
- **Agent Execution → Data Source**: the Cube Analyst proposes a Governed Query Plan; deterministic policy authorizes and executes it.
- **Connector → Sequence**: a Source Table may seed a Sequence's raw input; a Sequence never reads a Source Field the Connector has not harvested.
- **Data Source → Sequence**: a Dataset Table Version may seed a Sequence's raw input; the Dataset Workspace owns every Sequence built over its tables.
- **Sequence → Agent Execution**: the Data Steward Agent proposes and executes each Sequence Step as one Agent Execution; the graph, not any single execution, is the durable record.
- **Sequence → Semantic Modeling**: a Sequence's Final Table is the only thing the Semantic Modeler Agent may model; it never models a raw Source Table or Dataset Table directly.
- **Trust & Verification → Sequence**: Human Approval gates a Semantic Model draft built over a Sequence's Final Table; individual Sequence Steps execute without a gate because each is a typed, reversible, versioned operation.
- **Agent Execution → Observability**: safe, allowlisted Agent Execution telemetry (never prompts, completions, or raw tool arguments/results) exports over OpenTelemetry to Langfuse, on the same allowlist that gates the Activity Feed — see [[adr/0031-langfuse-on-the-existing-safe-telemetry-pipe]].
