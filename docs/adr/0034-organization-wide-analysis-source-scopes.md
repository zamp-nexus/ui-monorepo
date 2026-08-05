# ADR-0034: Organization-wide Analysis Source Scopes

## Status

Accepted

## Decision

An Analysis Run is governed by an immutable Organization-wide **Analysis Source
Scope**, not by an inferred single Data Connection. A scope records its member
Data Sources, Catalog Versions, execution capability, and confirmed-Relation
fingerprint. Chat creates its scope from every eligible Organization source and
every Analysis Run records the exact scope it used.

`GET /v1/catalog` reports all sources rather than failing when an Organization
has more than one. Sources that are unreachable, unharvested, or unsupported by
the active executor remain visible with an explicit status.

Cube remains source-local. Cross-source analysis is permitted only through a
federated execution adapter after every join edge is a confirmed Relation. The
adapter receives only governed projections from source-local executors and
never exposes source credentials to the client.

## Consequences

The former `data_connection_id` default is not a valid Chat-level routing rule:
it cannot represent all Organization data and must not be used to silently pick
one source. A scope snapshot makes a Finding reproducible after a source is
re-harvested, removed, or a Relation changes.
