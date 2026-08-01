---
title: "PRD: ZentraOS Multi-Agent Investigation Chat Backend with Thesys C1"
labels:
  - ready-for-agent
status: ready-for-agent
type: prd
---

# PRD: ZentraOS Multi-Agent Investigation Chat Backend with Thesys C1

## Problem Statement

ZentraOS can already execute governed analytical Investigations through an Orchestrator, SQL Analyst, Evaluator, and Insight Agent, preserve typed outcomes and evidence, enforce Human Approval, record model usage, and replay redacted process events. However, the product currently exposes this capability as fixed-scenario Investigation creation followed by polling a technical timeline. It does not provide the durable, organized, conversational experience that users expect from an AI-native analytical workspace.

From a user's perspective, there is no place to organize analytical work into Groups and Projects, no persistent chat-like Thread for a business question and its follow-ups, no live view of the AI employees collaborating, and no rich final answer that turns governed evidence into an immediately understandable chart, table, or analytical summary. Users cannot see which Agent is working, what capability it is exercising, what model it used, how many tokens it consumed, how much it cost, or how one Agent handed work to the next. Follow-up questions also lack a safe, explicit relationship to the Investigation that produced the earlier answer.

The absence of a conversational layer creates a product-language risk as well as a usability gap. ZentraOS defines an Investigation as one traceable attempt to answer one governed business question; treating an unlimited chat transcript as one mutable Investigation would blur question boundaries, evidence lineage, approval decisions, usage attribution, cancellation, and replay. A trustworthy chat experience therefore cannot simply wrap the existing endpoint in a message box. It needs an explicit Thread model that preserves immutable Investigation boundaries while presenting them as one coherent conversation.

The final analytical response is another gap. A textual Finding can be correct and cited but still require the user to mentally translate measurements into trends, comparisons, and priorities. Hand-building every possible chart in the frontend would be slow, brittle, and incompatible with a one-week hackathon. At the same time, allowing a generative UI model to query data or invent analytical conclusions would violate ZentraOS's trust model. The product needs a presentation-only Data Visualization Agent that receives a constrained, evidence-bound Visualization Brief after publication and uses Thesys C1 to create a renderable response without becoming part of evidence generation.

The requested delivery is backend-only. The backend must own persistence, orchestration, authorization, durability, event delivery, Thesys integration, safe actions, and machine-readable contracts. It must not implement frontend pages, components, styling, themes, or client state. The frontend team must be able to build the entire experience from OpenAPI, JSON Schemas, SSE contracts, examples, and deterministic fixtures supplied by the backend.

This is a one-week hackathon build, so the solution must minimize infrastructure and operational cost. It must reuse the existing FastAPI modular monolith, LangGraph pipeline, Postgres control plane, ClickHouse audit ledger, Cube semantic layer, model-provider routing, tenant authentication, and Nx task graph. It must not introduce Redis, Kafka, Celery, WebSockets, a vector database, or a second chat/orchestration platform.

## Solution

Build a backend-only multi-agent Investigation chat platform organized as `Tenant → Group → Project → Investigation Thread → Investigation(s)`. A Thread is the chat-like product surface. Each governed question inside it remains a separate immutable Investigation, and each follow-up becomes a linked child Investigation. The user experiences one linear conversation while the backend preserves evidence, approval, replay, cost, and cancellation boundaries per question.

The first user message creates a Draft Investigation Thread. A conservative router maps supported natural-language paraphrases to the governed scenario catalogue. If the message is ambiguous or unsupported, the backend stores it and returns a clarification with supported suggestions without creating an unresolved Investigation. Once one scenario is resolved, the backend creates an Investigation and a durable Postgres job. During execution, the browser can consume a resumable Work Feed over Server-Sent Events and observe the five Agents, their declared capabilities, public-safe progress, handoffs, provider/model choice, fallbacks, latency, tokens, and cost.

The analytical pipeline remains authoritative:

`User question → Orchestrator → SQL Analyst → Evaluator → Insight Agent → publication policy / Human Approval → published Finding`.

After publication, the pipeline coordinator creates a versioned Visualization Brief from the canonical Finding, typed claims, exact measurements, validated aggregates, citations, caveats, and allowed actions. It then performs a deterministic handoff to a fifth registered Agent, the Data Visualization Agent. This Agent has no semantic-layer, database, audit-store, MCP, or arbitrary tool access. It sends only the approved Visualization Brief to the Thesys C1 Visualize HTTP API and stores the returned C1 response as a presentation artifact.

The final flow is:

`Published Finding → Visualization Brief → Data Visualization Agent → Thesys C1 Visualize → persisted C1 response → frontend contract`.

The Data Visualization Agent runs for every published Finding. Quantitative results may become line, area, bar, grouped/stacked bar, pie, radar, radial, table, or metric-card presentations. Non-quantitative results may become structured text, cards, callouts, or tables. The Visualization Brief remains the factual source of truth; the C1 response is an independently retryable presentation artifact. A Thesys outage never changes the Investigation outcome or hides the ordinary Finding and citations.

Use Thesys's Free platform allowance for all tenants while calling the documented, version-pinned Visualize model rather than a content-retaining free model. Analytical Agent routing remains tenant-plan-specific: Free tenants use the existing free analytical chain, and Paid tenants use the existing paid analytical chain. Visualization routing is independent. No application-level monetary or token ceiling blocks either pipeline, but all analytical and visualization usage remains visible and attributable.

Commands remain REST; live Work Feed delivery uses resumable SSE. Postgres stores mutable control-plane data, Thread messages, ordered public events, durable jobs, Visualization Briefs, C1 responses, and safe action mappings. ClickHouse receives only immutable redacted process metadata and opaque artifact references. No raw user question, Visualization Brief, C1 payload, SQL, customer row, prompt, credential, or private reasoning is written to the audit ledger.

The backend supplies complete frontend contracts: OpenAPI 3.1, a versioned Visualization Brief JSON Schema, Work Feed event schemas, SSE reconnection rules, C1 artifact examples, safe-action contracts, failure/tombstone fixtures, and a backend-only smoke flow. The frontend team will later render `c1_response` with Thesys `<C1Component>`, not `<C1Chat>`, because ZentraOS remains the owner of Groups, Projects, Threads, messages, actions, permissions, and persistence.

### Product outcomes

- Users can organize analytical conversations without losing tenant isolation or Investigation traceability.
- Users can watch real Agents collaborate without exposing chain-of-thought or private prompts.
- Every final answer remains grounded in governed evidence and is accompanied by a rich, durable presentation.
- Follow-ups feel conversational while preserving one-question-per-Investigation semantics.
- Frontend engineers receive stable, machine-readable contracts instead of reverse-engineering backend state.
- The hackathon deployment adds no broker or new application service beyond the existing backend stack and external Thesys API.

### Success criteria

- An admin can create a Group and Project using the API.
- A member can create a Thread with a paraphrased supported question.
- The Thread can exist in a Draft state while clarification is unresolved.
- A resolved question creates exactly one Investigation and exactly one durable execution job.
- A connected client can observe all five Agents through ordered SSE events and reconnect without losing or duplicating events.
- The API exposes Agent capability, provider, model, fallback, latency, input-token, output-token, and USD-cost data without exposing forbidden content.
- A Human Approval can be requested, decided, and replayed through the existing governed workflow.
- A published Finding produces one deduplicated Visualization Brief and one Data Visualization Agent execution.
- A successful Thesys call produces a durable C1 artifact retrievable independently of the Work Feed.
- A failed Thesys call leaves the Finding readable, exposes a deterministic fallback brief, and supports bounded automatic and explicit manual retry.
- A contextual follow-up creates a linked Investigation using only published context.
- Cross-tenant resource IDs and event streams never reveal whether another tenant's data exists.
- OpenAPI, JSON Schemas, fixtures, and the backend smoke journey are sufficient for frontend implementation without backend source-code knowledge.

## User Stories

1. As a Tenant owner, I want all analytical conversations isolated to my Tenant, so that no other customer can discover our questions, evidence, costs, or generated visualizations.
2. As a Tenant owner, I want to see which external model subprocesses receive governed data, so that I can understand privacy and residency implications.
3. As a Tenant admin, I want to create a Group, so that I can organize related Projects under a meaningful business area.
4. As a Tenant admin, I want to rename a Group, so that organizational changes do not require recreating analytical history.
5. As a Tenant admin, I want to archive and restore a Group, so that inactive work leaves the primary workspace without being destroyed.
6. As a Tenant member, I want to read all active Groups in my Tenant, so that I can find the correct place for my work.
7. As a Tenant viewer, I want read-only access to Groups and Projects, so that I can observe work without restructuring it.
8. As a Tenant admin, I want to create a Project inside a Group, so that related Investigation Threads share a clear context.
9. As a Tenant admin, I want to rename, archive, and restore a Project, so that its lifecycle remains manageable without deleting evidence.
10. As a Tenant member, I want Projects ordered by recent activity, so that current analytical work is easy to find.
11. As a Tenant member, I want to create a Thread by sending my first question, so that no empty or meaningless Thread is created.
12. As a Tenant member, I want a Thread title generated without another model call, so that organization does not create avoidable latency or cost.
13. As a Tenant member, I want to ask a supported business question in my own words, so that I do not need to know internal scenario keys.
14. As a Tenant member, I want an ambiguous question to produce a clarification instead of an invented answer, so that the system remains honest about its governed scope.
15. As a Tenant member, I want supported question suggestions in a Draft Thread, so that I can recover from an unsupported prompt without losing context.
16. As a Tenant member, I want clarification messages persisted, so that refresh and navigation do not erase the conversation that led to an Investigation.
17. As a Tenant member, I want the backend to create an Investigation only after one governed question is resolved, so that evidence and replay always have a defined subject.
18. As a Tenant member, I want messages to be append-only, so that prior analytical instructions cannot be silently rewritten after the result exists.
19. As a Tenant member, I want to delete a Draft-only Thread, so that abandoned clarifications do not clutter the Project.
20. As a Tenant member, I want analytical Threads to be archivable rather than hard-deletable, so that completed work retains its audit history.
21. As a Tenant member, I want to see when an Investigation is queued, running, evaluating, awaiting approval, completed, cancelled, or failed, so that its state is unambiguous.
22. As a Tenant member, I want to see the Orchestrator begin and delegate work, so that the multi-agent process is visible.
23. As a Tenant member, I want to see the SQL Analyst use its governed semantic-query capability, so that I understand where the measurements came from.
24. As a Tenant member, I want to see the Evaluator independently validate analytical output, so that the result is more trustworthy than a single model response.
25. As a Tenant member, I want to see the Insight Agent synthesize a Draft Finding, so that I understand when evidence becomes a candidate conclusion.
26. As a Tenant member, I want to see the Data Visualization Agent receive the published result, so that visualization is visibly downstream of validation rather than a source of facts.
27. As a Tenant member, I want concise public Agent updates, so that I can follow progress without reading internal prompts or reasoning.
28. As a security-conscious user, I want raw chain-of-thought and system prompts excluded, so that sensitive implementation and model content is not exposed.
29. As a Tenant member, I want each Agent's declared capabilities displayed, so that the term “skill” represents a real supported ability rather than marketing copy.
30. As a Tenant member, I want Agent handoffs displayed in order, so that I can understand how responsibility moved through the pipeline.
31. As a Tenant member, I want provider and model attribution per Agent Execution, so that I know which model actually served each role.
32. As a Tenant member, I want provider fallback failures recorded, so that a successful result does not hide degraded execution.
33. As a Tenant member, I want exact input and output token counts, so that usage is transparent.
34. As a Tenant member, I want exact recorded USD cost and latency per Agent, so that I can compare quality, speed, and spend.
35. As a Tenant member, I want aggregate Thread usage, so that I can understand the total cost of a conversational line of inquiry.
36. As a Free-plan customer, I want analytical Agents routed only through the free chain, so that plan behavior is predictable.
37. As a Paid-plan customer, I want analytical Agents routed through the paid chain, so that paid reliability and quality are used directly.
38. As a Tenant user, I want visualization routing independent of the analytical model tier, so that every published Finding can use the supported Thesys Visualize path.
39. As a Tenant member, I want an active run to reject additional prompts, so that mid-run messages cannot silently alter the execution plan.
40. As a Tenant member, I want to request cancellation, so that I can stop queued work or prevent further Agent calls in a running Investigation.
41. As a Tenant member, I want cancellation to occur at a safe checkpoint, so that persisted evidence and execution history are not corrupted.
42. As a Tenant member, I want a failed or cancelled question retried as a linked Investigation, so that the original attempt remains immutable.
43. As an operator, I want abandoned execution leases recovered, so that an API restart does not permanently strand work.
44. As an operator, I want only one worker to claim a job, so that duplicate Agent pipelines and duplicate spend are minimized.
45. As an operator, I want transient infrastructure failures retried with bounded backoff, so that temporary provider problems do not require immediate human intervention.
46. As an operator, I want domain failures distinguished from infrastructure failures, so that invalid evidence is not retried as if it were a network outage.
47. As a Human Reviewer, I want approval requests to explain every failed publication condition, so that my decision considers the full policy outcome.
48. As a Human Reviewer, I want only authorized roles to approve or reject, so that generated UI and ordinary members cannot bypass governance.
49. As a Human Reviewer, I want approval decisions reflected in the Work Feed and replay, so that later readers know why publication proceeded or stopped.
50. As a Tenant member, I want each published claim connected to citations, so that I can inspect the governed evidence behind it.
51. As a Tenant member, I want unavailable evidence distinguished from deliberately erased evidence, so that absence is not misrepresented.
52. As a Tenant member, I want to ask a contextual follow-up, so that I can continue an analytical line without restating the entire earlier question.
53. As a Tenant member, I want follow-ups to inherit only published questions, Findings, approved claims, and citation references, so that drafts and private Agent content do not contaminate new work.
54. As a Tenant member, I want a follow-up to re-query governed evidence, so that prior measurements are not assumed to remain current.
55. As a Tenant member, I want each follow-up represented as a linked Investigation, so that every answer retains its own evidence, approval, cost, and replay boundary.
56. As a Tenant member, I want a linear Thread during the hackathon, so that follow-up context is predictable and the UI does not require branch navigation.
57. As a Tenant member, I want every published Finding to receive an appropriate visual presentation, so that the final answer is easier to understand.
58. As a Tenant member, I want time-series data shown as an appropriate trend visualization, so that changes over time are immediately visible.
59. As a Tenant member, I want comparisons shown as bars, tables, or metric cards as appropriate, so that relative performance is clear.
60. As a Tenant member, I want non-quantitative Findings rendered as structured text, cards, or callouts, so that C1 remains useful even when a chart would be misleading.
61. As a Tenant member, I want visualization caveats displayed with the result, so that visual polish does not hide evidentiary limits.
62. As a Tenant member, I want observed claims visually distinct from interpretations, so that the interface preserves the Investigation's epistemic boundaries.
63. As a Tenant member, I want visualization citations preserved, so that a chart remains traceable to the same evidence as its Finding.
64. As a security-conscious user, I want the Data Visualization Agent denied database and semantic-query access, so that it cannot expand its presentation task into new analysis.
65. As a security-conscious user, I want Thesys to receive governed aggregates rather than raw rows or SQL, so that the external subprocess receives the minimum necessary data.
66. As a security-conscious user, I want the Visualization Brief stored beside the C1 response, so that generated presentation can be audited against immutable facts.
67. As a Tenant member, I want a failed visualization to leave the Finding available, so that a presentation outage does not erase analytical value.
68. As a Tenant member, I want a deterministic fallback brief, so that the frontend can display a safe answer when C1 is unavailable or cannot render.
69. As a Tenant member, I want to retry a failed visualization without rerunning the Investigation, so that presentation recovery does not repeat analytical cost.
70. As an operator, I want successful visualizations deduplicated by a normalized brief hash, so that retries and refreshes do not spend another C1 call.
71. As an operator, I want Thesys token, cost, latency, model, and failure attribution recorded separately, so that visualization spend is distinguishable from analytical spend.
72. As a Tenant member, I want the completed C1 response persisted, so that refresh and reconnect show the same final visualization.
73. As a frontend engineer, I want a stable artifact endpoint, so that I can retrieve the C1 response independently of the SSE connection.
74. As a frontend engineer, I want renderer kind, model, and API version returned with the artifact, so that I can use a compatible Thesys SDK.
75. As a frontend engineer, I want a strict Visualization Brief JSON Schema, so that fallback rendering and fixtures are deterministic.
76. As a frontend engineer, I want every Work Feed event to have a stable discriminated schema, so that event handling is type-safe.
77. As a frontend engineer, I want `Last-Event-ID` resume semantics, so that reconnect does not require reloading an entire Thread.
78. As a frontend engineer, I want a complete Thread snapshot plus an event cursor, so that initial load and live tail cannot race.
79. As a frontend engineer, I want server-calculated action flags, so that I do not duplicate authorization or lifecycle rules in the client.
80. As a frontend engineer, I want deterministic fixtures for Draft, running, approval, completed, failed, tombstoned, and visualization-failure states, so that I can build without live models.
81. As a frontend engineer, I want the backend to document `<C1Component>` integration without supplying UI code, so that ownership boundaries remain clear.
82. As a frontend engineer, I want C1 actions reduced to opaque server-issued identifiers, so that generated payload text never becomes an implicit command.
83. As a Tenant member, I want generated follow-up suggestions to use an authenticated backend action, so that the suggestion cannot bypass Thread rules.
84. As a Tenant member, I want generated citation navigation to resolve through an authorized citation endpoint, so that copied identifiers cannot probe another Tenant.
85. As a security engineer, I want unknown, expired, replayed, and mismatched visualization actions rejected, so that generated UI cannot escalate privileges.
86. As a security engineer, I want arbitrary URLs, SQL, tools, downloads, and approvals excluded from C1 actions, so that presentation cannot become an execution channel.
87. As a compliance operator, I want visualization content included in terminal evidence erasure, so that derived presentation does not survive source-evidence deletion.
88. As a compliance operator, I want a non-sensitive visualization tombstone after erasure, so that replay explains the missing artifact without retaining customer content.
89. As an operator, I want readiness to report whether Thesys is configured, so that missing visualization configuration is visible before a demo.
90. As an operator, I want Thesys rate-limit and authentication failures categorized without leaking provider bodies, so that incidents can be diagnosed safely.
91. As an operator, I want no live Thesys calls in CI, so that tests are deterministic and cost-free.
92. As an autonomous implementation Agent, I want one end-to-end backend acceptance seam, so that I can verify the product outcome without coupling tests to internal classes.
93. As an autonomous implementation Agent, I want the PRD's contracts and exclusions to be explicit, so that I do not accidentally build frontend or speculative infrastructure.
94. As a product owner, I want the hackathon scope to reuse the existing modular monolith, so that the team can finish and demonstrate the core experience in one week.
95. As a product owner, I want the final backend handoff to include OpenAPI, JSON Schemas, examples, and smoke tooling, so that frontend implementation can start immediately afterward.

## Implementation Decisions

### 1. Product and domain boundaries

- The product surface may use the word “chat,” but the canonical analytical object remains an Investigation.
- An Investigation continues to mean one traceable attempt to answer one governed business question. It must not become a mutable multi-turn aggregate.
- The canonical conversational container is an Investigation Thread. It is a linear sequence of messages and zero or more linked Investigations.
- `Chat` is presentation vocabulary. `Investigation Thread` is backend and domain vocabulary.
- `AI employee` is presentation vocabulary. `Agent` remains the canonical registered autonomous worker.
- `Skill` is presentation vocabulary. `Capability` is the canonical declared role-specific ability.
- The Work Feed is the ordered public-safe representation of collaboration. It is not a reasoning transcript or replacement for Audit Replay.
- The Data Visualization Agent is a real fifth Agent with the canonical role `visualization`, but it is presentation-only and does not participate in evidence generation.

### 2. Organizational hierarchy

- Every Group belongs to exactly one Tenant.
- Every Project belongs to exactly one Group and the same Tenant.
- Every Investigation Thread belongs to exactly one Project and the same Tenant.
- Every non-legacy Investigation belongs to exactly one Thread and the same Tenant.
- Legacy Investigations remain readable through additive nullable relationships; migration must not fabricate containment history.
- Groups and Projects are organizational containers, not authorization boundaries in week one.
- Owners and admins create, rename, archive, and restore Groups and Projects.
- Owners, admins, and members create and operate Threads and Investigations.
- Viewers can read but cannot mutate.
- Names must be non-empty, length-bounded, normalized for uniqueness within their parent, and safe for display. IDs, not names or slugs, are authoritative references.
- Archive is reversible and cascades only as an availability rule: archived containers make descendants non-writable but do not rewrite descendant records.

### 3. Conversation lifecycle

- The first user message and Thread are created atomically; no empty Thread endpoint is provided.
- Thread state is `draft`, `active`, or `archived`.
- Draft Threads may contain user and router clarification messages without an Investigation.
- A conservative router resolves input only against the governed scenario catalogue and maintained paraphrase/keyword aliases.
- Routing creates an Investigation only when exactly one supported scenario wins. Ambiguous or unsupported input persists and receives a clarification response plus supported suggestions.
- Routing may be deterministic for the initial supported catalogue. It must never ask an LLM to invent a scenario or business definition.
- New user questions are rejected with a stable conflict error while the latest Investigation is non-terminal.
- Messages are append-only. Corrections are new messages, never edits.
- A Thread with no Investigation may be deleted. Once analytical work exists, the Thread can only be archived or restored.
- Follow-ups attach only to the latest terminal Investigation; branches are not supported.
- Each resolved follow-up creates a new linked Investigation with explicit parent and sequence.
- Retry creates a linked replacement Investigation with a retry reference; it never resets or mutates the earlier attempt.
- Follow-up context contains prior user questions, published Findings, approved claims, and citation references only.
- Work Feed narration, raw tool output, raw model messages, failed drafts, private reasoning, and erased content are excluded from follow-up context.
- Every follow-up re-runs governed semantic queries rather than assuming earlier measurements are still current.
- Titles are generated deterministically from the first canonical question or safe user text and do not consume an LLM call.

### 4. Persistence model

- Add tenant-scoped persistence for Groups, Projects, Investigation Threads, Thread Messages, Thread Events, Execution Jobs, Visualization Artifacts, and Visualization Actions.
- Extend Investigations with Thread ID, parent Investigation ID, sequence number, initiating message ID, and retry-of Investigation ID.
- Extend the Agent Registry with public display name, public description, visual metadata, and a versioned set of declared capabilities.
- Thread Messages distinguish user question, user clarification, router clarification, and safe system message kinds. Agent progress is not stored as ordinary chat messages.
- Thread Events use a strictly increasing sequence within each Thread and a globally unique event ID.
- The Thread row owns the next event sequence; allocation is transactional to prevent duplicates under concurrency.
- Thread Event payloads are discriminated and type-specific rather than arbitrary unvalidated dictionaries.
- Execution Jobs record queued, leased, completed, failed, and cancelled states; lease owner; lease expiry; available time; bounded attempt count; sanitized failure category; and cancellation request.
- Visualization Artifacts store the source brief, normalized brief hash, C1 response, renderer/model/version metadata, usage, latency, failure category, retry lineage, and timestamps.
- Visualization Actions store an opaque identifier, action kind, fixed server-side target, resource scope, expiry, use policy, and creation metadata.
- Tenant-safe composite constraints and indexes must make cross-tenant parent/child combinations structurally invalid, not merely filtered at the API.
- Existing row-level tenant context and repository conventions remain authoritative.

### 5. Durable execution worker

- Replace request-bound FastAPI background execution with a Postgres-leased worker started in the application lifespan for the hackathon deployment.
- Use `FOR UPDATE SKIP LOCKED` to claim work and permit future worker-process separation without changing job semantics.
- Persist Agent Execution start before invoking an Agent and completion before advancing to the next logical step.
- Treat persisted Agent Executions and Investigation state as checkpoints. A reclaimed job resumes at the first incomplete logical step.
- Logical steps must have an idempotency constraint so worker recovery cannot persist duplicate completion records.
- A process can still repeat an external provider call if it dies after receiving the response but before persistence; this at-least-once edge must be documented and metered when detectable.
- Retry only transient network, provider-rate-limit, and dependency-unavailable failures. Do not retry domain validation failures as infrastructure failures.
- Apply bounded exponential backoff and a stable maximum attempt count.
- Cancellation is cooperative. Queued work cancels before claim; running work checks before and after each Agent/provider call and between graph nodes.
- An already-sent provider request is not forcibly interrupted.
- The API and worker ship in one deployable container/image for week one. No broker is added.

### 6. Work Feed and Server-Sent Events

- REST remains the command protocol. Server-Sent Events is the server-to-client progress protocol.
- The Thread Events table is the durable public projection used for initial replay and reconnect.
- Postgres `LISTEN/NOTIFY` is only a wake-up hint. Correctness comes from querying persisted events after the last delivered sequence.
- The SSE event ID is the per-Thread sequence.
- Support standard `Last-Event-ID` and an explicit `after` cursor for clients unable to set the header.
- Send heartbeat comments every 15 seconds.
- A client first obtains a Thread snapshot and event cursor, then tails events strictly after that cursor.
- Reconnection must be gap-free and duplicate-tolerant.
- Stable event families include Thread/message lifecycle, routing clarification, Investigation state, Agent start/update/capability/handoff/completion, provider fallback, usage, approval, Finding publication, cancellation, failure, and visualization lifecycle.
- Use the same domain event ID for the public projection and audit outbox representation when they describe the same underlying event.
- Public Agent summaries are length-bounded, schema-validated, and safe for the Tenant, but they may never include chain-of-thought, system prompts, credentials, raw SQL, raw rows, or private tool/model messages.

### 7. Agent registry and collaboration

- The executable week-one roster is Orchestrator, SQL Analyst, Evaluator, Insight Agent, and Data Visualization Agent.
- The Backend Architect persona supplied during discovery is a future roster example, not an executable application Agent in this PRD.
- An enabled Agent must continue to require a passing evaluation status.
- Agent metadata is registry-owned rather than hard-coded in the client.
- Orchestrator capabilities cover governed planning and delegation.
- SQL Analyst capabilities cover governed semantic querying and aggregate interpretation.
- Evaluator capabilities cover independent deterministic/typed validation.
- Insight Agent capabilities cover evidence-bound Draft Finding synthesis.
- Data Visualization Agent capabilities cover Visualization Brief consumption, chart selection, generative UI composition, Thesys C1 rendering, and presentation fallback.
- Handoffs are typed public events, not free-form Agent-to-Agent messages.
- No user may directly mention or invoke an Agent in week one. The Orchestrator owns delegation.
- Users may ask, observe, cancel, retry, and complete authorized Human Approval; mid-run replanning is excluded.

### 8. Visualization Brief contract

- Define a strict `VisualizationBriefV1` schema with `extra` fields forbidden and a literal schema version.
- The brief contains Investigation and Finding identifiers, canonical question, headline, answer summary, key metrics, series, comparisons, time range, recommended view, title/subtitle, claims, validation outcome, confidence, caveats, source references, and allowed actions.
- Key metrics include label, exact value, display value, unit, direction, and citation IDs.
- Series include label, dimensions, ordered points, unit, and citation IDs.
- Claims preserve observed-versus-interpretation kind and citation IDs.
- Supported view recommendations are auto, line, area, bar, horizontal bar, grouped bar, stacked bar, pie, radar, radial, table, metric cards, and structured text.
- The brief is assembled deterministically from the published Finding and governed evidence. The Data Visualization Agent does not decide what facts enter it.
- All quantitative points must trace to existing Measurement or validated aggregate values. No raw customer rows enter the brief.
- Brief size, series count, points per series, narrative length, and action count are bounded to protect latency, token usage, and C1 request size.
- Normalize and hash the brief. A ready artifact with the same Tenant, source Finding, schema version, renderer configuration, and brief hash is reused.
- The brief is persisted as the factual fallback and independent audit source for the generated presentation.

### 9. Data Visualization Agent boundary

- The Agent is a terminal presentation node invoked only after a Finding is published or an approval permits publication.
- The pipeline coordinator emits a deterministic Orchestrator-to-Visualization-Agent handoff; no extra Orchestrator model call is needed.
- The Agent receives the Visualization Brief and presentation prompt only.
- It has no Semantic Layer Port, repository, raw data, audit reader, file access, MCP client, arbitrary tool port, or approval interface.
- Architecture dependency rules must prevent the visualization module from importing data-access adapters.
- It cannot change Investigation status, Finding content, citations, validation, confidence, approval, or erasure policy.
- It runs for every published Finding. It chooses chart/table/card/structured layout based only on the brief and prompt.
- Its C1 response is a presentation artifact, never evidence and never a replacement for the Finding.
- Visualization lifecycle is independent of Investigation lifecycle.

### 10. Thesys C1 adapter

- Use the official two-step Visualize pattern rather than replacing ZentraOS analytical models with C1 Embed/Gateway.
- Call the OpenAI-compatible base URL `https://api.thesys.dev/v1/visualize` and chat-completions endpoint.
- The request contains system and user messages and no tools.
- Week one uses a non-streaming C1 call inside the durable worker. The complete response is persisted before `visualization.completed` is emitted.
- Default to the version-pinned model `c1/anthropic/claude-sonnet-4/v-20251230`, configurable through a server environment setting.
- Reject unversioned aliases such as `latest` during configuration validation.
- Store and return the served model and extracted C1 API version because renderer dependencies are version-coupled.
- Keep the Thesys API key server-side and never include it in logs, errors, events, fixtures, or OpenAPI examples.
- Use the Thesys Free platform allowance but not a content-retaining free model. Model-token charges remain separately measurable.
- The main analytical Free/Paid model-tier routing remains unchanged and independent.
- The C1 system prompt instructs the model that supplied numbers, dates, units, labels, caveats, claim kinds, and citations are immutable; it must not infer, interpolate, recompute, or introduce claims.
- The prompt instructs C1 to use only supplied action IDs and never create approval, SQL, tool, download, or arbitrary URL actions.
- The prompt prefers charts for quantitative trends/comparisons, tables for dense data, metric cards for headline measurements, and structured content for non-quantitative answers.
- Treat the C1 response as an opaque, size-bounded renderer payload. The currently published DSL is not a stable server-validation schema.
- Record Thesys input/output tokens, calculated cost where pricing is known, latency, model, API version, and sanitized failure category separately from analytical Agent usage.
- Pricing data is externally configurable and must not be embedded as permanent domain policy.

### 11. Visualization failures, retry, and fallback

- Publish the Finding and complete the Investigation before visualization begins.
- Artifact state is pending, generating, ready, failed, or tombstoned.
- Thesys failure cannot transition a completed Investigation to failed.
- Retry automatically once for network errors, rate limits, and Thesys 5xx responses.
- Do not automatically retry invalid request, invalid authentication, or oversized payload failures.
- Manual retry creates a new artifact with retry lineage and reuses the immutable brief; it does not rerun analytical Agents.
- A ready artifact is never regenerated unless its source brief or renderer version changes.
- The artifact endpoint always exposes the fallback brief when tenant policy permits, including when status is failed.
- Missing Thesys configuration marks visualization unavailable/degraded without breaking existing Finding retrieval.
- CI and ordinary unit/integration tests use stubs, cassettes, and golden C1 fixtures; they never call the paid external API.

### 12. Safe generated actions

- Week one permits only `continue_conversation` and `open_citation` generated interactions.
- Allowed actions are created server-side before C1 generation and represented in the brief by opaque IDs and human labels.
- C1 may render an allowed action ID but cannot define its server behavior.
- Action execution re-authenticates the actor and re-resolves Tenant, Thread, Investigation, visualization, and target resource.
- Unknown, expired, already-consumed when single-use, cross-Tenant, wrong-artifact, or wrong-state actions are rejected with stable errors.
- Ignore arbitrary parameters returned by C1. The fixed server mapping is authoritative.
- `continue_conversation` creates or proposes a server-known follow-up message only when the Thread can accept one.
- `open_citation` resolves through the existing Tenant-safe citation endpoint.
- Generated UI can never approve/reject, run SQL, invoke tools/Agents, trigger arbitrary downloads, or open arbitrary URLs.

### 13. Data placement, audit, privacy, and erasure

- Postgres is the mutable tenant-scoped control plane for organization, conversations, jobs, Work Feed projection, briefs, artifacts, and actions.
- ClickHouse remains the immutable audit ledger for redacted process events.
- Audit Events may include visualization ID, status, model, API version, tokens, cost, latency, failure category, and opaque artifact reference.
- Audit Events must not include user message text, Visualization Brief content, C1 response, raw data, SQL, prompts, credentials, or action payloads.
- Thesys receives only governed aggregates and approved narrative necessary to produce the presentation.
- Document Thesys as an external US-hosted subprocess and record its data categories in model-provider/subprocessor documentation.
- Terminal evidence erasure must erase Visualization Brief content, C1 response, and derived safe-action mappings associated with the Investigation.
- Erasure leaves only visualization identity, tombstone state, erasure category, and erasure timestamp needed to explain absence.
- Unavailable visualization is a failure state, not a tombstone. Tombstone is reserved for deliberate erasure.

### 14. HTTP contracts

- Group contracts cover create, list, retrieve, rename/update, archive, and restore.
- Project contracts cover create within Group, list, retrieve, rename/update, archive, and restore.
- Thread contracts cover create-with-first-message, list by Project with cursor pagination, retrieve full snapshot, append message, archive, restore, and delete Draft-only Thread.
- Investigation controls cover cooperative cancel and linked retry while preserving existing detail, approval, citation, and evidence-erasure endpoints.
- Agent catalogue returns all five registered Agents, evaluation/enabled state, version, public metadata, and capabilities.
- Visualization contracts cover retrieve by Investigation, retrieve by visualization ID, retry failed artifact, and execute allowlisted action.
- Resource lists use opaque cursor pagination and stable ordering by latest activity then ID.
- Every response forbids undeclared fields and returns server-calculated available actions rather than asking the client to interpret roles and lifecycle.
- Use stable structured error codes for not found/inaccessible, invalid transition, unsupported question, active Thread conflict, archived parent, visualization unavailable, action invalid, dependency unavailable, and rate limited.
- Missing, nonexistent, cross-Tenant, and inaccessible identifiers return indistinguishable `404` behavior where existence disclosure would violate tenant isolation.
- Visualization artifact responses include ID, source Investigation, status, renderer kind, model, API version, complete C1 response when ready, fallback brief, usage, failure information safe for the user, and available actions.

### 15. Frontend contract handoff

- This PRD authorizes no frontend implementation.
- Generate and commit OpenAPI 3.1 for all REST endpoints.
- Publish JSON Schema for Visualization Brief and every discriminated Work Feed event.
- Provide example payloads for Draft clarification, queued/running Agent events, approval, completed Finding, ready visualization, failed visualization, retry, action rejection, and tombstone.
- Provide a backend-only smoke script or API collection that exercises the entire acceptance journey without a browser.
- Provide deterministic fixtures that do not require live providers.
- Document snapshot-then-tail SSE consumption, `Last-Event-ID`, deduplication, heartbeat, terminal states, and reconnection.
- Document that the frontend must render the returned C1 string with Thesys `<C1Component>`, not `<C1Chat>`.
- Document required renderer package/version compatibility, Crayon styles, ThemeProvider expectation, action callback mapping, and fallback rendering, but do not add those packages or write client code.
- Do not create a speculative frontend SDK abstraction. OpenAPI and JSON Schemas are the source contracts.

### 16. MCP and skills

- Do not add MCP to the production visualization path.
- The Thesys Docs MCP is an optional implementation-time documentation source, not a runtime dependency.
- Thesys guidance for arbitrary MCP tools applies to C1 Embed and is unnecessary because ZentraOS already owns LangGraph tools and C1 Visualize does not accept tools.
- The hosted Thesys render MCP targets MCP-capable host clients and does not replace the browser backend contract.
- No official Thesys Codex skill is assumed.
- Capability metadata for the Data Visualization Agent is implemented in the Agent Registry; it is not dynamic `SKILL.md` execution.

### 17. Cost and operational policy

- There is no application-enforced Investigation cost ceiling.
- Free analytical tenants use free analytical models; Paid analytical tenants use paid analytical models.
- Every tenant uses the supported Thesys Visualize path under the platform's Free call allowance until external plan configuration changes.
- Generate at most once per unique published brief and renderer version.
- Do not invoke Thesys for Draft clarification, cancelled, rejected, failed, or approval-waiting Investigations.
- Bound payload and output size to control token usage.
- Surface provider rate limiting as a retryable visualization failure and preserve the fallback.
- Readiness reports whether Thesys is configured; core liveness does not call Thesys or incur cost.

### 18. One-week delivery ordering

- Day 1: domain language, schemas, migrations, repositories, hierarchy, and authorization.
- Day 2: Thread/message lifecycle, conservative routing, linked Investigations, list/snapshot contracts.
- Day 3: Postgres job lease, worker checkpoints, cancellation/retry, Agent Registry and Work Feed foundation.
- Day 4: Visualization role, dependency boundary, Visualization Brief, Thesys adapter, artifact persistence, deduplication, and fallback.
- Day 5: visualization APIs/actions, SSE resume, approvals/citations integration, erasure extension, and Thread aggregate usage.
- Day 6: OpenAPI, JSON Schemas, fixtures, smoke tooling, documentation, and contract tests.
- Day 7: full tenant-isolation, restart/recovery, privacy, load, external-adapter fixture, and demo acceptance rehearsal; then freeze.

### 19. Documentation decisions

- Update the root glossary with Group, Project, Investigation Thread, and Work Feed.
- Update Investigation vocabulary and relationships for linked linear follow-ups.
- Update Agent Execution vocabulary with Data Visualization Agent, Capability, and presentation-only outcomes.
- Update the context map relationship from published Investigation outcomes to presentation artifacts.
- Update canonical notes for the Postgres control plane, FastAPI service, Investigation API, Investigation trust loop, audit architecture, model-provider subprocesses, and evidence erasure.
- Record ADRs for Thread-as-linked-Investigations, Postgres-leased execution without a broker, structured public Work Feed without reasoning, Thesys as terminal presentation subprocess, and Visualization Brief as the factual generative-UI boundary.
- Add backlinks and run the repository documentation check before completion.

## Testing Decisions

### Testing philosophy and primary seam

- Tests assert externally observable behavior and domain invariants, not private method calls, SQL statement shape, or framework internals.
- The primary acceptance seam is one backend-only API/SSE journey using real application services and Postgres with fake analytical and Thesys provider ports. It begins at authenticated Group creation and ends at durable C1 artifact retrieval, safe action execution, SSE reconnect, and linked follow-up.
- This is the highest stable seam that proves the product without requiring a frontend or live paid model calls.
- Lower seams exist only where they protect a domain boundary that the primary journey cannot isolate economically: strict DTO validation, tenant-safe persistence constraints, provider failure classification, and dependency architecture.
- Existing API tests, Investigation service tests, LangGraph graph tests, Postgres adapter tests, ClickHouse audit tests, model-provider cassette tests, and phase acceptance tests are the prior art. New tests should extend those patterns rather than introduce a parallel test harness.

### Domain and contract tests

- Verify Group, Project, Thread, Message, Job, Visualization Brief, Artifact, and Action invariants.
- Verify every new request/response forbids undeclared fields.
- Verify roles and server-calculated available actions for owner, admin, member, and viewer.
- Verify canonical Agent roles include visualization while compatibility reads remain safe.
- Verify enabled visualization Agent requires a passing evaluation.
- Verify declared capabilities are versioned and returned from the registry.
- Verify Visualization Brief schema rejects missing citations, invalid view kinds, unbounded series, unordered points, unsupported actions, raw-data-like fields, and unknown properties.
- Snapshot OpenAPI and JSON Schemas to detect accidental contract changes.

### Migration and persistence tests

- Apply all migrations to an empty database and to a representative pre-feature database.
- Verify legacy Investigations remain readable with null Thread relationships.
- Verify same-Tenant hierarchy constraints and reject cross-Tenant parent IDs.
- Verify normalized name uniqueness within the correct parent but not across unrelated parents/Tenants.
- Verify archive does not delete or mutate descendants.
- Verify Draft-only deletion and analytical-Thread deletion refusal.
- Verify immutable messages have no update path.
- Verify per-Thread event sequences remain unique and increasing under concurrent writers.
- Verify brief-hash uniqueness reuses ready artifacts and allows new artifacts for changed schema/model/brief.
- Verify evidence erasure removes brief/C1/action content and leaves a non-sensitive tombstone.

### Routing and conversation tests

- Test exact supported questions and representative paraphrases.
- Test ambiguity, unsupported questions, empty/oversized messages, and malicious scenario-key injection.
- Verify unresolved messages create Draft Threads but no Investigation/job.
- Verify resolution creates exactly one Investigation/job.
- Verify active Thread message conflict.
- Verify archived Group/Project/Thread write refusal.
- Verify follow-up attachment to latest terminal Investigation only.
- Verify follow-up context contains published content and excludes drafts, raw events, erased citations, and private execution data.
- Verify follow-up re-queries evidence and creates independent usage/replay.

### Durable worker tests

- Verify exclusive claim under competing workers.
- Verify lease renewal and expired-lease recovery.
- Verify resume from the first incomplete persisted Agent step.
- Verify logical step idempotency.
- Verify bounded transient retry and no retry for domain failure.
- Verify queued cancellation and cooperative running cancellation.
- Verify linked retry preserves the original Investigation.
- Verify a worker/API restart does not strand active work.

### Work Feed and SSE tests

- Verify every stable event kind and discriminated payload.
- Verify public summaries never contain forbidden fields or known secret/raw-data fixtures.
- Verify snapshot cursor and tail cannot lose events created between requests.
- Verify strict event order and idempotent projection.
- Verify `Last-Event-ID`, explicit cursor, heartbeat, reconnect, and duplicate tolerance.
- Verify completion and visualization events reference durable resources rather than embedding large payloads.
- Verify cross-Tenant and invisible Thread SSE requests have nondisclosing behavior.
- Verify disconnected clients do not affect worker execution.

### Agent and trust tests

- Verify the standard four-Agent analytical flow remains unchanged before publication.
- Verify Data Visualization Agent runs only after publication/approval.
- Verify it cannot import or receive semantic-layer, repository, audit-reader, raw model, file, shell, MCP, or arbitrary tool capabilities.
- Verify its failure never changes Investigation status/Finding/citations.
- Verify Agent start, handoff, capability, completion, model, fallback, token, cost, and latency attribution.
- Verify raw chain-of-thought and system prompts cannot fit into public/audit types.
- Verify approval gating and citation resolution continue to satisfy existing trust tests.

### Thesys adapter tests

- Use a fake OpenAI-compatible transport and recorded safe C1 fixture; never call Thesys in CI.
- Verify base URL, pinned model, non-streaming mode, messages, and absence of tools.
- Verify unversioned model configuration is rejected.
- Verify API key never appears in exceptions, logs, events, or responses.
- Verify the outbound Visualization Brief contains approved aggregates/citations and excludes raw rows, SQL, prompts, credentials, PII fixtures, and reasoning.
- Verify successful response persistence, usage attribution, API-version extraction, size bound, and completion event.
- Verify one automatic retry for network/429/5xx and no automatic retry for 400/403/413.
- Verify manual retry lineage and no analytical rerun.
- Verify deduplication prevents a second call for the same ready brief.
- Verify malformed/empty/oversized C1 responses become safe failed artifacts with fallback.

### Safe-action tests

- Verify only server-issued `continue_conversation` and `open_citation` actions are accepted.
- Verify unknown, expired, replayed, cross-Tenant, wrong-artifact, wrong-state, and tampered action IDs are rejected.
- Verify C1-provided arbitrary parameters are ignored.
- Verify follow-up action observes active/archived Thread rules.
- Verify citation action preserves nondisclosing authorization.
- Verify approvals, tools, SQL, downloads, and arbitrary URLs cannot be represented as accepted action kinds.

### API and end-to-end acceptance

- Create authenticated Tenant context, Group, and Project.
- Create a Draft Thread from an ambiguous message and resolve it with clarification.
- Observe one durable Investigation and one job.
- Consume ordered SSE events for Orchestrator, SQL Analyst, Evaluator, and Insight Agent.
- Exercise Human Approval where policy requires it.
- Publish a cited Finding.
- Observe Orchestrator handoff and Data Visualization Agent events.
- Retrieve the ready C1 artifact and verify its fallback brief and usage.
- Disconnect/reconnect using the last event ID and verify no gaps.
- Execute an allowlisted follow-up action and verify a linked child Investigation.
- Run a Thesys-failure variant and verify completed Finding plus failed/retryable artifact.
- Run a cross-Tenant variant for every new resource and stream.

### Verification commands

- Run affected Nx tests and builds through the workspace package manager.
- Run lint through Nx for every changed Python project.
- Run migration tests against Postgres.
- Run the backend-only smoke flow with fake providers.
- Run the repository documentation check.
- Do not require frontend build, browser, React, or live Thesys credentials for backend acceptance.

## Out of Scope

- Implementing or modifying any frontend page, React component, route, styling, design token, theme, composer, sidebar, animation, or state-management code.
- Installing Thesys React packages or rendering `<C1Component>` in this change.
- Using Thesys `<C1Chat>` as the product shell.
- Progressive C1 token/UI streaming in week one; only the complete durable C1 artifact is delivered.
- Replacing existing analytical models or LangGraph orchestration with C1 Embed or C1 Gateway.
- Adding Thesys MCP, the Thesys Docs MCP, hosted render MCP, or any MCP server as a production dependency.
- Dynamic discovery or execution of Codex `SKILL.md` packages.
- Making the supplied Backend Architect or other Codex persona definitions executable ZentraOS Agents.
- Direct user `@mention` invocation of Agents.
- Mid-run user intervention, checkpoint editing, or orchestrator replanning beyond cooperative cancel and governed approval.
- Branching Investigation Threads or automatic reference resolution to arbitrary older branches.
- Per-Group or per-Project memberships, private sharing, invite flows, or a second ACL hierarchy.
- File uploads, document/image ingestion, OCR, malware scanning, external-link retrieval, or attachment storage.
- Arbitrary ungoverned questions, raw SQL generation, or access outside the Semantic Metric catalogue.
- WebSockets, Redis, Celery, Kafka, RabbitMQ, a vector database, or a separate chat microservice.
- Hard deletion of analytical Threads or general message editing.
- Arbitrary C1 custom actions, direct URLs, approval actions, tool invocations, SQL, or downloads.
- Treating a generated visualization as evidence, a Finding, validation, or an approval.
- Failing or rolling back a valid Investigation because Thesys visualization failed.
- Using Thesys content-retaining free models for tenant analytics.
- Production multi-region deployment, private Thesys environment, BYO Thesys model key, or automatic external spend-limit management.
- VisaVision/Atlys schemas, visa prediction, notification, OCR, traveler workflows, or other product requirements from the unrelated research report.

## Further Notes

### Terminology

- The external product is **Thesys C1**, not “Thesis.dev.” User-facing/internal documents should correct the spelling while preserving redirects or search aliases where helpful.
- Investigation remains the core trust boundary. A Thread is the conversational navigation and context boundary.
- Work Feed is safe product telemetry; Audit Replay is immutable governance history. They may correlate by event ID but serve different audiences and retention rules.
- Visualization Brief is an approved presentation input, not a prompt transcript.
- C1 response is a renderer artifact, not a stable JSON domain object and not a source of truth.

### Thesys integration rationale

- Thesys officially describes the two-step Visualize pattern for applications that already own LLM/tool infrastructure: the primary system completes business logic and C1 converts the final response into interactive UI.
- Visualize is preferable to Embed because ZentraOS already owns tool calling, governed data access, provider routing, conversation history, and validation.
- Visualize does not accept tools, which reinforces the desired presentation-only boundary.
- Thesys's React runtime later renders the stored C1 response through `<C1Component>`. The backend must expose the complete string and compatible model/API version.
- The Thesys Free platform plan includes a limited number of C1 calls, while model tokens are billed separately. This PRD therefore optimizes call count through once-per-published-brief generation and deduplication rather than pretending visualization is costless.
- Official Thesys documentation warns that free-model requests/responses may be retained. This PRD intentionally uses the documented Visualize model path rather than a retained free model.

### External dependency risks

- Thesys model and SDK versions may drift. Pin a tested version and return it in the API; upgrades require contract fixtures and renderer compatibility review.
- Thesys publishes an opaque structured response rather than a complete stable server-side DSL schema. Factual safety comes from the strict brief, narrow prompt, safe-action mapping, persisted fallback, golden fixtures, and separation from Finding status—not from pretending the backend can fully prove arbitrary generated markup.
- Thesys rate limits and organization spend limits are external. A 429 is recoverable presentation degradation, not an analytical failure.
- Thesys is US-hosted in the public service. This must remain visible in subprocess and data-residency documentation.

### Delivery risk and scope control

- The full specification is intentionally broad, but the one-week critical path is: hierarchy, Thread/message lifecycle, durable job, Work Feed/SSE, fifth Agent/brief, non-streaming Thesys artifact, retrieval contract, failure fallback, and one end-to-end acceptance test.
- Safe actions, manual visualization retry, advanced list filters, and complete fixture breadth follow after the core path but remain required before the issue is considered fully complete.
- No engineer should spend hackathon time building speculative abstractions, a generalized agent marketplace, a dynamic skill sandbox, or a new infrastructure service.

### Issue readiness

- This PRD is decision-complete for backend implementation and should carry only the `ready-for-agent` triage label.
- Implementation should be decomposed into tracer-bullet issues only after this PRD is accepted as the parent specification.
- Repository domain notes and ADRs must be updated in the same engineering change as their behavior; implementation without canonical documentation is incomplete.
