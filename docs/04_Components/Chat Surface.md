---
id: component-chat-surface
title: Chat Surface
type: component
status: active
owner: unassigned
source: repository
created: 2026-08-01
updated: 2026-08-01
reviewed: 2026-08-01
confidence: verified
implementation: current
priority: high
tags: [component, frontend, react, chat, sse, generative-ui]
aliases: [chat, thread surface]
related: ["[[Components MOC]]", "[[Forensic Observatory]]", "[[Investigation Thread API]]", "[[Visualization and Work Feed API]]", "[[Workspace Organization API]]"]
depends_on: ["[[FastAPI Service]]", "[[TypeScript Foundation Library Catalog]]"]
repo_path: apps/zentra-os/src/app/pages/chat
code_refs:
  - apps/zentra-os/src/app/pages/chat/chat-page.tsx
  - apps/zentra-os/src/app/pages/chat/api.ts
  - apps/zentra-os/src/app/pages/chat/use-thread-events.ts
  - apps/zentra-os/src/app/pages/chat/use-active-group.ts
  - apps/zentra-os/src/app/pages/chat/activity-inspector.tsx
  - apps/zentra-os/src/app/pages/chat/use-resizable-panel.ts
  - apps/zentra-os/src/app/pages/chat/composer-commands.ts
  - apps/zentra-os/src/app/pages/chat/visualization-answer.tsx
  - apps/zentra-os/src/app/pages/chat/brief-answer.tsx
  - apps/zentra-os/src/app/types/thread.ts
  - apps/zentra-os/src/app/pages/chat/chat.spec.tsx
---

# Chat Surface

The conversational entry point to a governed Analysis Run, and the app's
primary landing surface (`/`, ADR-0028). It replaced a hardcoded fixture:
every Chat Session, message, agent update and answer now comes from the API.

## Snapshot then tail

`GET /v1/chats/{id}` is the source of truth for *content*; the SSE Activity
Feed at `/events` is the source of *progress*. The snapshot hands over
`event_cursor`, the stream resumes with `?after={cursor}`, and terminal events
invalidate the snapshot query rather than patching state locally. An event
cannot be un-received, so a feed treated as state would let a dropped
connection silently change what a reader believes.

The endpoint is bearer-protected and the browser's `EventSource` cannot set
headers, so the stream is read with `fetch` plus a body reader. `parseEvents`
buffers partial chunks, ignores the `: heartbeat` comment, and events are
deduplicated by `event_id` — the sequence is also the resume token, so a
reconnect legitimately replays it.

Agent activity itself is hidden by default behind the Activity Inspector
(`activity-inspector.tsx`) — a resizable right panel on desktop, a bottom
drawer on mobile, opened from a header toggle (ADR-0029). A pending Human
Approval is the one exception and stays inline in the conversation
(`investigation-controls.tsx`), never inside the panel.

## Workspace resolution

Chat Sessions belong directly to a Group now — there is no Project layer
between them (ADR-0028). `useActiveGroup` resolves one on first use — list
Groups, create `Workspace` if there are none — in a single query so
concurrent mounts share one resolution instead of racing to create two. A
viewer who cannot provision gets an explanation, not a 403 loop. The hook is
the seam where a Group picker would replace auto-provisioning.

## Composer commands

`composer-commands.ts` parses `#dataset`, `@user`, and `/skill` out of a
draft message into a clean text body plus recognized hints, shown as chips
(ADR-0032). None bypass governance: `/skill` still routes through Intake,
which still validates it against the Tenant's Analytical Scope. Only
`#dataset` has a real backend effect (Chat Session's dataset default);
`@user` and `/skill` are parsed and shown, not yet acted on.

## Server-decided actions

`can_append_message`, `can_cancel`, `can_retry`, and `can_decide` are read from
the snapshot, never derived. `can_append_message` no longer depends on the
latest Analysis Run's status — a follow-up is legal any time the Chat Session
isn't archived, so the composer is never blocked by an in-flight Analysis Run
(ADR-0028). A client re-deriving any of these flags would be a second copy
that can disagree with the server. `thread_conflict` is the error that
surfaces when a mutation is refused regardless.

Chat never posts to `/v1/investigations` — that is the older standalone flow the
launcher uses. Analytical work here is only ever a consequence of a Chat
Session message the Intake Agent resolves against the Tenant's governed
semantic layer. Intake now answers one of four dispositions: `resolved`,
`ambiguous`, `unsupported`, or `not_analytical` (ADR-0033) — the last routes to
a Conversational Agent instead of opening an Analysis Run, for a message that
isn't a business question at all. There is no scenario whitelist: a question
nobody anticipated is answerable when the data supports it and refused with a
reason when it does not. See
[[adr/0027-analytical-scope-replaces-scenario-whitelist]].

## Generative UI, and what happens without it

`GET /v1/investigations/{id}/visualization` returns both the opaque Thesys
`c1_response` and the typed `fallback_brief`. When the rendered payload exists
it goes to `<C1Component>` (not `<C1Chat>`, which would run its own conversation
loop) inside Crayon's `ThemeProvider`, lazily imported so the renderer stays out
of the main bundle.

When it does not — pending, generating, failed, tombstoned, or simply no
`THESYS_API_KEY` — `brief-answer.tsx` renders the same answer natively from the
design system: metrics, a hand-drawn two-bar comparison chart, observed and
interpreted claims, caveats, confidence, citations, and the same safe actions.
This is not a degraded placeholder. A governed product that shows nothing when a
third-party renderer is down has made that renderer part of the guarantee.

Actions are re-authorised server-side: only the `action_id` is read, only when
it matches an action the server itself put in the brief, and generated
parameters are discarded on both sides.

## Renderer packages

`@thesysai/genui-sdk`, `@crayonai/react-ui`, `@crayonai/react-core` — the
versions pinned by [[Visualization and Work Feed API]].

Parent: [[Components MOC]]
