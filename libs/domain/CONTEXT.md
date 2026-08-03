# ZentraOS Domain

ZentraOS is a chat-first analytical workspace: every question a User asks in a Chat Session may open a governed Analysis Run whose claims can be verified and replayed, without the User ever needing to know that boundary exists.

## Tenancy and identity

**Organization**:
A customer whose data, policies, costs, and Analysis Runs are isolated from every other customer. Replaces Tenant as the canonical term for the chat and analysis surface; see [[adr/0028-chat-session-and-analysis-run-replace-investigation-thread-and-investigation]]. Connector, Sequence, Data Source, and Agent Execution have not yet made this switch and still say Tenant — same concept, unreconciled term, tracked in `CONTEXT-MAP.md`.
_Avoid_: Tenant, Account, Clerk organization

**User**:
A human identity that may participate in more than one Organization.
_Avoid_: Tenant user, account

**Membership**:
The relationship granting a User one role—owner, admin, member, or viewer—inside an Organization.
_Avoid_: User role, guest membership

**Group**:
An Organization-visible organizational container that directly holds Chat
Sessions. A Group does not create a separate authorization boundary, cannot
contain another Group, and there is no container between a Group and a Chat
Session.
_Avoid_: Team, workspace ACL, Project

## Chat and Analysis

**Chat Session**:
The durable, append-only conversation a Group directly owns. It holds an
ordered stream of Messages and accumulates zero or more Analysis Runs over
its lifetime — one per analytical Message, not one for the whole session. An
empty Chat Session may be deleted; once it holds a Message it is append-only
and archivable, never deleted. Shared with every Organization member by
default; a private Chat Session is visible to its creator only — no
collaborator invitation, no admin override, per
[[adr/0033-private-chat-sessions-and-assistant-reply-messages]].
_Avoid_: Investigation Thread, Project, mutable chat session, Agent transcript

**Message**:
An immutable, append-only user or assistant contribution to one Chat Session,
persisted as a real row — not a client-side render of other state. An
assistant reply is a Message whose optional Analysis Run link is set only
when the reply answered an analytical question; a Conversational Agent's
plain reply is a Message with no Analysis Run. Agent progress belongs to the
Activity Feed, not the message text.
_Avoid_: Thread Message, prompt log, editable chat bubble, reasoning event

**Analysis Run**:
One governed, traceable attempt to answer a single analytical question raised
by one Chat Session Message — Agent orchestration, data access, evidence,
validation, confidence, approval, retries, cancellation, cost, and audit
replay, exactly as an Investigation carried them. Hidden by default; a User
sees it only through the Activity Feed or the inline approval card. A
follow-up question chains to the run it follows via parent lineage rather than
merging into it, so cost, evidence, and approval stay independently traceable
per question.
_Avoid_: Investigation, chat, query, run

**Activity Feed**:
A persisted, typed, public projection of Chat Session and Agent progress,
ordered by an atomically allocated Chat sequence and resumable without
exposing prompts, reasoning, SQL, raw rows, credentials, or provider bodies.
Drives the Activity Inspector panel; the one exception is a pending Human
Approval, which surfaces inline in the conversation instead of waiting for the
panel to be opened.
_Avoid_: Work Feed, Agent transcript, log stream, message history

**Visualization Brief**:
A strict factual projection of a published Finding used as the only input to
terminal presentation rendering.
_Avoid_: Prompt, query result, C1 response

**Analysis Replay**:
The ordered record that explains how an Analysis Run moved from its question to each claim and decision.
_Avoid_: Investigation Replay, logs, reasoning dump

## Trust and semantics

**Human Approval**:
A blocking decision by a User that grants, rejects, or modifies work that cannot proceed autonomously.
_Avoid_: Agent approval, confirmation

**Audit Entry**:
An immutable, Organization-scoped fact about an Analysis Run step containing process metadata and artifact references, never raw customer data.
_Avoid_: Log line, prompt record

**Semantic Metric**:
A governed business measure with one agreed definition and grain for an Organization.
_Avoid_: Calculated field, raw SQL metric

**Semantic Model**:
An immutable Organization-approved version of governed metrics, dimensions, relationships, classifications, and source mappings.
_Avoid_: Cube schema, inferred schema, data model

**Metric Draft**:
A proposed business measure with definition, formula, grain, filters, time behavior, units, and sources that has not entered an approved Semantic Model version.
_Avoid_: Ad hoc metric, calculated field
