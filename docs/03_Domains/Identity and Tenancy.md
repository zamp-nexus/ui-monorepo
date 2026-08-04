---
id: domain-identity-tenancy
title: Identity and Tenancy
type: domain
status: active
owner: unassigned
source: context-map
created: 2026-07-29
updated: 2026-07-29
reviewed: 2026-07-29
confidence: verified
implementation: current
priority: critical
tags: [domain, identity, tenancy]
related: ["[[Domains MOC]]", "[[Tenancy Security]]", "[[Authenticated Tenant Resolution]]"]
repo_path: libs/domain/CONTEXT.md
code_refs:
  - libs/domain/CONTEXT.md
  - apps/api/src/zentra_api/request_context.py
  - libs/adapters/postgres/src/zentra_adapter_postgres/schema.py
---

# Identity and Tenancy

An Organization is the isolated customer account. A User is a global human
identity. A Membership relates one User to one Organization with exactly one
role: owner, admin, member, or viewer.

Clerk is the current provider, but provider subject and organization IDs remain
bindings. Internal UUIDs own all product relationships. One User may hold
Memberships in multiple Organizations.

The API establishes Organization context from a verified token and active
provider organization. Caller-supplied organization identifiers are never
authoritative.

**Disambiguation:** "Organization" is overloaded — Clerk has its own external
organization concept, with its own ID. Internal code and the schema keep these
distinguishable by prefix: `external_organization_id` names Clerk's own ID;
bare `organization_id` names this system's internal UUID. Never conflate the
two, and never introduce a second naming scheme for the same distinction.

Avoid “account,” “Clerk organization” (when the internal UUID is meant),
“organization user,” and “guest membership” when naming domain facts.
Canonical definitions: [ZentraOS domain context](../../libs/domain/CONTEXT.md).

Parent: [[Domains MOC]]
