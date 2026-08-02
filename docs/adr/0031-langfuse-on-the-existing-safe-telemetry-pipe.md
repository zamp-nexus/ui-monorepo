---
id: adr-0031
title: Langfuse on the existing safe-telemetry pipe, no richer path
type: adr
status: proposed
owner: unassigned
source: decision
created: 2026-08-02
updated: 2026-08-02
reviewed: 2026-08-02
confidence: verified
implementation: planned
tags: [adr, observability, telemetry, langfuse]
related: ["[[adr/0028-chat-session-and-analysis-run-replace-investigation-thread-and-investigation]]"]
repo_path: libs/adapters/telemetry
---

# Langfuse on the existing safe-telemetry pipe, no richer path

## Decision

Agent, tool, and skill observability is added by pointing
`zentra-adapter-telemetry`'s existing OTLP exporter at Langfuse Cloud's free
tier (`/api/public/otel`) — no new infrastructure, no LangChain (confirmed
absent from the stack and deliberately kept out per the architecture's own
dependency-boundary test). Langfuse receives exactly what any other OTLP
consumer already receives: spans built from the `SAFE_ATTRIBUTES` allowlist —
categories, counts, durations, identifiers. It gets no separate, richer
integration path — including Langfuse's native prompt/completion tracing —
even for internal engineering debugging.

## Considered Options

A richer SDK-based integration capturing full prompts/completions for
engineers only, never customer-visible, was considered — it is what Langfuse
is natively built for and would give deeper debugging power. Rejected: the
codebase's telemetry philosophy is an allowlist, not a sanitizer, specifically
because "a filter that can be fooled is worse than no filter"
(`test_no_evidence_leaks.py`); a second, richer channel to the same
destination — even one scoped to engineers — reintroduces the exact
side-channel that philosophy exists to prevent, with no way to guarantee it
stays engineer-only once it exists.

Self-hosting Langfuse (reusing already-committed ClickHouse credit) was
considered and deferred rather than rejected: since nothing sensitive reaches
Langfuse either way, there is no privacy reason to pay the self-hosting
infrastructure cost up front, and moving to self-hosted later is an
endpoint/credential swap, not a re-architecture.

## Consequences

`SAFE_ATTRIBUTES` must be extended beyond its current coverage (Insight
execution, publication decision, citation resolution, evidence deletion) to
also cover Intake, Cube Analyst, and Data Visualization agent runs, tool
calls, and skill activations — otherwise Langfuse and the Activity Feed
cannot show the full agent/tool/skill picture this was meant to provide. Any
span carrying a `model` attribute is auto-classified by Langfuse as a
Generation; Langfuse Sessions map to Chat Sessions and Langfuse Traces map to
Analysis Runs via identifiers already on the allowlist.
