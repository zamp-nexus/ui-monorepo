---
id: adr-0041
title: Sequence Prepared Tables live in Nexus-managed ClickHouse
type: adr
status: proposed
owner: unassigned
source: repository
created: 2026-08-06
updated: 2026-08-06
reviewed: 2026-08-06
confidence: verified
implementation: planned
priority: high
tags: [adr, sequence, clickhouse, prepared-table, governed-query]
related:
  - "[[Sequence Domain]]"
  - "[[Data Source Domain]]"
  - "[[adr/0016-cube-is-the-single-tenant-scoped-analytical-gateway]]"
  - "[[adr/0022-sequence-step-execution-is-distinct-from-phase-3-query-execution]]"
depends_on:
  - "[[adr/0016-cube-is-the-single-tenant-scoped-analytical-gateway]]"
repo_path: libs/adapters/sequence-execution
code_refs:
  - libs/domain/sequence/CONTEXT.md
  - libs/adapters/sequence-execution/src/zentra_adapter_sequence_execution/chdb_execution.py
  - libs/application/connector/src/zentra_application_connector/service.py
---

# Sequence Prepared Tables live in Nexus-managed ClickHouse

## Status

Proposed; implementation is planned.

## Context

Sequence execution currently writes immutable Prepared Tables as Parquet files
in Lambda-local storage. That makes the transformation graph observable but
leaves Final Tables neither durable nor queryable. Uploaded files are already
landed as Nexus-owned ClickHouse tables, while connected customer sources are
read-only.

## Decision

Every successful Sequence Step will persist its Prepared Table in a
tenant-scoped, Nexus-managed ClickHouse database. A Final Table remains a
Prepared Table marked query-eligible; it does not duplicate its data. Later
Steps and branches read their immutable parent Prepared Table from that same
store.

The New Sequence picker will accept both connected and uploaded sources. The
server resolves an uploaded source to its Nexus-owned landed table; the browser
never receives or supplies a storage locator. Customer-connected sources remain
read-only.

Final Tables will be available to the governed query path only after semantic
modelling and approval. The first release may provide a bounded, read-only
preview for validation, but it will not expose arbitrary user SQL.

## Consequences

- Prepared Table identifiers need a deterministic, tenant-isolated ClickHouse
  table mapping and cleanup lifecycle.
- The execution adapter must write and read ClickHouse tables instead of
  Lambda-local Parquet files.
- Queryability depends on the semantic-model and governed-query integration;
  durable storage alone does not authorize a Final Table for analysis.
- Supporting uploaded sources is an extension of the existing source/catalog
  picker, not a client-provided file-path API.

## Considered options

**Keep Parquet in Lambda `/tmp`.** Rejected because Lambda-local storage is
ephemeral and cannot back later queries or another invocation's Sequence Step.

**Write results into a customer-connected ClickHouse source.** Rejected because
Connector sources are read-only and output ownership, credentials, and cleanup
would become ambiguous.

**Expose arbitrary SQL against Final Tables.** Rejected for the initial release
because it bypasses the governed analytical gateway and expands the tenancy and
authorization surface.
