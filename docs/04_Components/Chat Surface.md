---
id: component-chat-surface
title: Chat Surface
type: component
status: active
owner: unassigned
source: repository
created: 2026-08-01
updated: 2026-08-06
reviewed: 2026-08-06
confidence: verified
implementation: current
priority: high
tags: [component, frontend, react, chat, sse, generative-ui]
aliases: [chat, thread surface]
related: ["[[Components MOC]]", "[[Forensic Observatory]]", "[[Investigation Thread API]]", "[[Visualization and Work Feed API]]", "[[Workspace Organization API]]"]
depends_on: ["[[FastAPI Service]]", "[[TypeScript Foundation Library Catalog]]"]
repo_path: apps/nexus/src/app/pages/chat
code_refs:
  - apps/nexus/src/app/pages/chat/chat-page.tsx
  - apps/nexus/src/app/shell/app-shell.tsx
  - apps/nexus/src/app/pages/chat/api.ts
  - apps/nexus/src/app/pages/chat/use-thread-events.ts
  - apps/nexus/src/app/pages/chat/use-active-group.ts
  - apps/nexus/src/app/pages/chat/composer-commands.ts
  - apps/nexus/src/app/pages/chat/chat-composer.tsx
  - apps/nexus/src/app/pages/chat/chat-messages.tsx
  - apps/nexus/src/app/components/markdown.tsx
  - apps/nexus/src/app/pages/chat/visualization-answer.tsx
  - apps/nexus/src/app/pages/chat/brief-answer.tsx
  - apps/nexus/src/app/types/thread.ts
  - apps/nexus/src/app/pages/chat/chat.spec.tsx
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

Agent activity is grouped inline with the live turn. A pending Human Approval
also stays inline in the conversation (`investigation-controls.tsx`), so the
reader never has to leave the chat to understand the work in progress.
While a run is active, its activity header carries a small pulsing live point;
it is removed on a terminal state and respects reduced-motion preferences.

The answer state is explicit: a Finding awaiting approval is shown as an
answer ready for review, not a failed run. A failed follow-up is labelled as a
separate attempt and does not invalidate an earlier answer in the same chat.

## Workspace resolution

Chat Sessions belong directly to a Group now — there is no Project layer
between them (ADR-0028). `useActiveGroup` resolves one on first use — list
Groups, create `Workspace` if there are none — in a single query so
concurrent mounts share one resolution instead of racing to create two. A
viewer who cannot provision gets an explanation, not a 403 loop. The hook is
the seam where a Group picker would replace auto-provisioning.

## Viewport containment

The authenticated app shell owns the viewport height and clips document-level
overflow. The chat transcript and the Project list are independent internal
scroll regions; neither may extend the navigation rail or create a second page
scrollbar. Flex ancestors at those boundaries explicitly allow shrinking so a
long chat or project list remains contained.

## Composer commands

`composer-commands.ts` parses `#dataset`, `@user`, and `/skill` out of a
draft message into a clean text body plus recognized hints, shown as chips
(ADR-0032). None bypass governance: `/skill` still routes through Intake,
which still validates it against the Tenant's Analytical Scope. Only
`#dataset` has a real backend effect (Chat Session's dataset default);
`@user` and `/skill` are parsed and shown, not yet acted on.

## Tiptap editing and reply rendering

The composer is a deliberately plain-text Tiptap editor. It keeps browser-native
caret movement, selection, IME support, Enter-to-send and Shift+Enter for a new
line, but exposes no formatting controls or Markdown shortcuts. The submitted
value remains the same clean text body the Chat Session API has always accepted;
Tiptap changes editing quality, not the API or persisted message format.
On send, the local draft is cleared both immediately and after Tiptap finishes
its key update; Enter-to-send also clears Tiptap's own document in the same
event, so a submitted message cannot remain or reappear in the composer. The
persisted user message is then shown as a compact right-aligned transcript
entry rather than a full-width second input surface.

Assistant replies use a read-only Tiptap Markdown renderer. It supports headings,
lists, tables, links, quotes and code, while escaping raw HTML before it is
parsed. Live turns receive short opacity/position transitions and the composer
shell animates focus and resize states; historical messages remain static and all
new motion respects the user's reduced-motion preference.

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
