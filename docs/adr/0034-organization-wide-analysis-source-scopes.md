---
id: adr-0040
title: Organization-wide Analysis Source Scopes
type: adr
status: proposed
owner: unassigned
source: decision
created: 2026-08-05
updated: 2026-08-05
reviewed: 2026-08-05
confidence: verified
implementation: current
tags: [adr, chat, analysis-run, data-source, cube]
related: ["[[adr/0016-cube-is-the-single-tenant-scoped-analytical-gateway]]", "[[Analysis Run Domain]]", "[[Data Source Domain]]"]
repo_path: apps/api/src/zentra_api/source_scoped_semantic.py
---

# Organization-wide Analysis Source Scopes

## Decision

An Analysis Run is governed by an immutable Organization-wide **Analysis Source
Scope**, not by an inferred single Data Connection. A scope records its member
Data Sources, Catalog Versions, execution capability, and confirmed-Relation
fingerprint. Chat creates its scope from every eligible Organization source and
every Analysis Run records the exact scope it used.

`GET /v1/catalog` reports all sources rather than failing when an Organization
has more than one. Sources that are unreachable, unharvested, or unsupported by
the active executor remain visible with an explicit status.

Cube remains source-local. A Chat can run independent governed queries over
several scoped sources and synthesize a labelled comparison of their aggregate
results. It cannot perform a cross-source SQL join, row-level match, or infer
a relationship between sources. Confirmed Relations authorize joins only among
tables in the same Data Source. Uploads are sources backed by Nexus-managed
ClickHouse credentials and follow this same source-local path; customer
ClickHouse credentials remain confined to their own source adapter.

## Consequences

The former `data_connection_id` default is not a valid Chat-level routing rule:
it cannot represent all Organization data and must not be used to silently pick
one source. A scope snapshot makes a Finding reproducible after a source is
re-harvested, removed, or a Relation changes.
