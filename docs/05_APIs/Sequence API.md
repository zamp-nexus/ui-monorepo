---
id: api-sequence
title: Sequence API
type: api
status: active
owner: unassigned
source: repository
created: 2026-08-02
updated: 2026-08-02
reviewed: 2026-08-02
confidence: verified
implementation: current
priority: high
tags: [api, sequence, dataset-workspace, react-flow]
related: ["[[APIs MOC]]", "[[Investigation Thread API]]", "[[Sequence Domain]]"]
depends_on: ["[[Authenticated Tenant Resolution]]", "[[Investigation Thread API]]"]
repo_path: apps/api/src/zentra_api/sequence_routes.py
code_refs:
  - apps/api/src/zentra_api/sequence_routes.py
  - apps/api/src/zentra_api/sequence_schemas.py
  - apps/api/src/zentra_api/sequence_model.py
  - libs/application/sequence/src/zentra_application_sequence
  - apps/api/tests/test_sequence_api.py
---

# Sequence API

Read and manually create Sequences — a Dataset Workspace-owned graph of
typed transform steps from a Raw Table to one or more Final Tables. Every
identifier is resolved under the authenticated Tenant; there is no
cross-Tenant read path.

| Method | Path | Purpose | Authorization |
| --- | --- | --- | --- |
| GET | `/v1/sequences` | List this Tenant's Dataset Workspace's Sequences, most recently active first | any role |
| GET | `/v1/sequences/{sequence_id}` | The full graph: Raw Table, Steps, Prepared Tables, failed Runs | any role |
| GET | `/v1/sequences/{sequence_id}/prepared-tables/{prepared_table_id}` | A bounded preview: columns and row count | any role |
| POST | `/v1/sequences` | Manual creation: pick a Raw Table, get a Sequence and its scoped Investigation Thread | any role that may create a Thread |

Reads are open to every role because nothing here grants more access than a
Tenant member already has to the underlying Connector catalog; creation is
gated by `ThreadService`'s own rules, since it always opens a Thread first.

## Dataset Workspace

`dataset_workspace_id` is derived, not stored: one per Tenant, via
`uuid5(NAMESPACE, tenant_id)` (`zentra_application_sequence.dataset_workspace_id_for`).
Data Source, which will eventually own Dataset Workspace as a real entity,
has no persisted schema yet. The list and graph responses both echo the id
so a client never has to compute it, and it is stable to derive again if
Data Source's own phase later replaces this.

## Origin

A Sequence's `origin` (`"manual"` or `"chat"`) is derived from whether it
carries a `thread_id` at creation — never a separate stored flag. The manual
creation flow always links one; a future auto-create-from-chat path (Phase
5) will produce the `"chat"` branch without any schema change.

## Graph shape

The graph response carries persisted lineage only — no coordinates, no
node/edge vocabulary. `steps[].input_prepared_table_id` is `null` when a
step reads the Raw Table directly; `prepared_tables[].parent_prepared_table_id`
is the same relationship from the table's side. `operation` is
`{kind, parameters}`, derived from the domain's closed five-operation
catalog (`drop_nulls`, `cast_type`, `dedupe`, `filter_rows`,
`rename_column`).

`failed_runs[].anchor_prepared_table_id` positions a failed attempt for
display — it is **not** recorded lineage. `sequence_runs` carries no input
reference (nothing writes one yet), so the anchor is derived as the
Prepared Table with the latest `created_at` strictly before the run's
`attempted_at`, or `null` (the Raw Table) if none preceded it. See
ADR-0023.

## Prepared Table preview

`sample_rows` is always `null`. A preview is limited to what Data Steward
itself is allowed to read from a Prepared Table — columns and row count,
already persisted at write time — and deliberately does not add a new
raw-data read path for the UI beyond what an Agent already has. See
ADR-0023.

## Manual creation

```jsonc
POST /v1/sequences
{
  "project_id": "…",
  "raw_table": {
    "kind": "connector_source_table",
    "catalog_version_id": "…",
    // Qualified `database.table` — the same shape a ClickHouse `remote()`
    // call needs downstream, so a typo here fails at creation rather than
    // at Data Steward's first `unknown_table` execution failure.
    "source_table_name": "clickathon.orders"
  },
  "message": "Clean up this table for modelling."
}
```

Composition order: a scoped Investigation Thread is created first
(`ThreadService.create`), then the Sequence, linked to it. These are two
application services with no shared transaction; if the Sequence create
fails after the Thread succeeded, the Thread is left orphaned (a Draft
thread in the Tenant's default Project) rather than attempting a
distributed rollback. `raw_table.kind: "dataset_table_version"` is accepted
by the request schema (the domain's Raw Table union already supports it)
but has no picker in the current UI — there is no Data Source upload path
yet.

Errors use FastAPI's default `detail` body: 403 permission denied, 404
unknown Sequence/Prepared Table/Raw Table, 409 the underlying Thread create
conflicted, 503 Sequence not configured (Connector's `RawTableResolver`
adapter requires `CONNECTOR_CREDENTIAL_KEY`).

Parent: [[APIs MOC]]
