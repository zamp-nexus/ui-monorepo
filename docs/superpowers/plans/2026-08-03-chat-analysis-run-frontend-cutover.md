# Chat & Analysis Run Frontend Cutover Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `apps/zentra-os`'s chat surface work against the API Plan 2 shipped (it currently calls routes that no longer exist), then give it the behavior ADR-0028/0029/0032/0033 promised: assistant replies rendered correctly, a composer that's never disabled by an in-flight Analysis Run, `#`/`@`/`/` power-user commands, a resizable Activity Inspector instead of always-visible agent chatter, and Chat as the primary surface instead of the Investigation launcher.

**Architecture:** All changes live in `apps/zentra-os/src/app/pages/chat` and `apps/zentra-os/src/app/types/thread.ts`, plus a small routing change in `app.tsx`/`nav-items.ts`. No visual redesign of colors/spacing/typography — this plan makes the surface functionally correct and structurally complete per the ADRs; pixel-perfect polish stays parked (tracked separately).

**Tech Stack:** React 19, TanStack Query, `@open-zentra/foundation-design-system`, Vite/Vitest. No new dependencies.

## Global Constraints

- No back-compat: the old `/v1/projects/{id}/threads` and `/v1/threads/{id}/...` paths are gone (Plan 2, PR #98) — every call site is updated in place, none left dual-pathed.
- Every task must be verified in a real browser (`pnpm nx serve zentra-os` or the project's actual serve target — confirm via `pnpm nx show project zentra-os` first) against a running `apps/api` + Postgres, not just unit tests. Screenshot or describe what you actually saw; "the code should do X" is not verification.
- `ThreadInvestigation`/`Investigation`/`ThreadService` vocabulary in the API and application layer is unchanged (Plans 1-3 deferred that rename) — this plan does not rename `investigation_id`, `ThreadInvestigation`, etc. in the frontend types either, even though the user-facing copy around them changes. Match the existing convention in `thread.ts`'s own docstring: the type mirrors the API contract exactly.
- Every new/changed component must keep the existing accessibility patterns (`aria-label`, `aria-live`, `role="alert"`) already present in the files it touches.

---

### Task 1: Fix the broken API client and Group-only navigation

**Files:**
- Modify: `apps/zentra-os/src/app/pages/chat/api.ts`
- Modify: `apps/zentra-os/src/app/pages/chat/use-active-project.ts` → rename to `use-active-group.ts`
- Modify: `apps/zentra-os/src/app/pages/chat/use-thread-events.ts`
- Modify: `apps/zentra-os/src/app/pages/chat/chat-page.tsx`
- Modify: `apps/zentra-os/src/app/types/thread.ts`
- Test: `apps/zentra-os/src/app/pages/chat/chat.spec.tsx`, `apps/zentra-os/src/app/pages/chat/use-thread-events.spec.tsx`

**Interfaces:**
- Produces: `useActiveGroup(getToken)` — same return shape as the old `useActiveProject` (a React Query result resolving to a `groupId: string`), consumed by `chat-page.tsx` exactly where `useActiveProject`/`projectId` are used today.

The app currently 404s against the real backend: `listProjects`/`createProject` call `/v1/groups/{id}/projects`, a route Plan 1 removed entirely (ADR-0028: no Project layer). `listThreads`/`createThread`/`getThread`/`appendMessage`/`archiveThread`/`restoreThread`/`deleteThread` call `/v1/projects/{id}/threads` and `/v1/threads/{id}/...`, which Plan 2 renamed to `/v1/groups/{id}/chats` and `/v1/chats/{id}/...`. `use-thread-events.ts`'s SSE URL is still `/v1/threads/{id}/events`.

- [ ] **Step 1: Rename the Thread functions in `api.ts`** to match the new paths one-for-one:

```typescript
export const listChats = (getToken: TokenSource, groupId: string, cursor?: string | null) =>
  requestJson<Page<ThreadSummary>>(
    `/v1/groups/${groupId}/chats${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''}`,
    getToken,
  );

export const createChat = (getToken: TokenSource, groupId: string, message: string) =>
  requestJson<Thread>(`/v1/groups/${groupId}/chats`, getToken, post({ message }));

export const getChat = (getToken: TokenSource, threadId: string) =>
  requestJson<Thread>(`/v1/chats/${threadId}`, getToken);

export const appendMessage = (getToken: TokenSource, threadId: string, message: string) =>
  requestJson<Thread>(`/v1/chats/${threadId}/messages`, getToken, post({ message }));

export const archiveChat = (getToken: TokenSource, threadId: string) =>
  requestJson<Thread>(`/v1/chats/${threadId}/archive`, getToken, post());

export const restoreChat = (getToken: TokenSource, threadId: string) =>
  requestJson<Thread>(`/v1/chats/${threadId}/restore`, getToken, post());

export const deleteChat = (getToken: TokenSource, threadId: string) =>
  requestJson<void>(`/v1/chats/${threadId}`, getToken, { method: 'DELETE' });
```

Remove `listProjects` and `createProject` entirely — there is no Project route to call. Update the file's own module docstring (it currently says "The chat surface creates analytical work only as a consequence of a Thread message resolving...") to drop any remaining Project/Thread-route references.

- [ ] **Step 2: Rewrite `use-active-project.ts` as `use-active-group.ts`** — drop the Project-provisioning step entirely, matching the flattened `Organization → Group → Chat Session` hierarchy (ADR-0028):

```typescript
/**
 * Where a chat gets its Group.
 *
 * Chat Sessions belong directly to a Group now — there is no Project layer
 * between them (ADR-0028). The chat surface still shows neither: someone
 * asking a question about refunds should not first have to invent an
 * organisational hierarchy. So the first visit provisions a Group and every
 * later visit reuses it.
 */

import { useQuery } from '@tanstack/react-query';

import { ApiError, type TokenSource } from '../../api';
import { createGroup, listGroups } from './api';

const DEFAULT_GROUP_NAME = 'Workspace';

export const activeGroupKey = ['chat', 'active-group'] as const;

export class ProvisioningDenied extends Error {
  constructor() {
    super(
      'You do not have a workspace to chat in yet, and your role cannot create one. Ask an owner or admin to add you to one.',
    );
    this.name = 'ProvisioningDenied';
  }
}

const resolveGroupId = async (getToken: TokenSource): Promise<string> => {
  const groups = await listGroups(getToken);
  const group = groups.items.find((candidate) => candidate.archived_at === null);
  if (group) return group.group_id;

  const created = await createGroup(getToken, DEFAULT_GROUP_NAME).catch((error: unknown) => {
    if (error instanceof ApiError && error.status === 403) throw new ProvisioningDenied();
    throw error;
  });
  return created.group_id;
};

export const useActiveGroup = (getToken: TokenSource) =>
  useQuery({
    queryKey: activeGroupKey,
    queryFn: () => resolveGroupId(getToken),
    staleTime: Number.POSITIVE_INFINITY,
    retry: false,
  });
```

- [ ] **Step 3: Update `chat-page.tsx`**'s imports and call sites: `useActiveProject`→`useActiveGroup`, `project`→`group`, `projectId`→`groupId`, `listThreads`→`listChats`, `createThread`→`createChat`, `getThread`→`getChat`, `archiveThread`/`restoreThread`/`deleteThread`→`archiveChat`/`restoreChat`/`deleteChat` (wherever those three are used — check `chat-history.tsx` too, `grep -rn "archiveThread\|restoreThread\|deleteThread" apps/zentra-os/src` first to find every call site).

- [ ] **Step 4: Fix the SSE URL in `use-thread-events.ts`**: `` `${apiUrl}/v1/threads/${threadId}/events?after=${sequence}` `` → `` `${apiUrl}/v1/chats/${threadId}/events?after=${sequence}` ``.

- [ ] **Step 5: Update `types/thread.ts`**: delete the `Project` interface (nothing constructs one anymore); update `Thread.project_id`'s doc comment if it references Project — check whether the field name itself should stay `project_id` (yes: the API's own `ThreadDetail.project_id`/`ThreadSummary.project_id` fields are unchanged, per this plan's Global Constraints, so the frontend type must match the wire shape exactly, stale name and all).

- [ ] **Step 6: Update tests.** `chat.spec.tsx` and `use-thread-events.spec.tsx` reference the old function/hook names and URL paths — update every one (`grep -n "useActiveProject\|listThreads\|createThread\|getThread\|/v1/projects\|/v1/threads" apps/zentra-os/src/app/pages/chat/*.spec.tsx` first to find them all).

- [ ] **Step 7: Run tests and start the dev server to confirm the chat page loads without 404s**

```bash
pnpm nx test zentra-os
pnpm nx serve zentra-os &  # or the project's actual serve target
```

Open the chat page in a browser, send a message, confirm it reaches a real response (requires `apps/api` running against a migrated Postgres — see Plan 1/2's Docker setup). Confirm the network tab shows `/v1/groups/*/chats`/`/v1/chats/*` calls, not 404s against the old paths.

- [ ] **Step 8: Commit**

```bash
git add apps/zentra-os
git commit -m "fix(zentra-os): point the chat surface at the renamed Chat Session API"
```

---

### Task 2: Render assistant replies correctly

**Files:**
- Modify: `apps/zentra-os/src/app/pages/chat/to-chat-message.ts`
- Modify: `apps/zentra-os/src/app/pages/chat/chat-message-row.tsx`
- Modify: `apps/zentra-os/src/app/types/thread.ts`
- Test: a new `apps/zentra-os/src/app/pages/chat/to-chat-message.spec.ts` if none exists (`find apps/zentra-os/src/app/pages/chat -iname "to-chat-message*"` first — there may already be coverage inside `chat.spec.tsx`; check before adding a new file)

**Interfaces:**
- No new exported functions — `toTimeline`'s existing behavior gains a case, `ChatMessageRow` gains a rendering branch for one more `kind` value.

`toTimeline` in `to-chat-message.ts` interleaves messages with `thread.investigations` by walking messages in order and consuming one Investigation per resolved question — skipping the pairing only when the very next message is a `router_clarification`. A `NOT_ANALYTICAL` message now produces an `assistant_reply` message with **no** Investigation attached (ADR-0033), and the check does not know about it — a real bug: a "hello" followed later by a real question would consume the wrong Investigation from the array, off-by-one, for every question after it in that Chat Session.

- [ ] **Step 1: Write the failing test first** (in whichever spec file Step-0's search found, or a new one) — construct a `Thread` fixture with messages `[user_question "hi", assistant_reply "Hi there!", user_question "Why did EU refunds increase?"]` and one `Investigation`, call `toTimeline`, assert the `answer` entry pairs with the *second* question, not the first.

- [ ] **Step 2: Fix the skip condition** in `to-chat-message.ts`:

```typescript
    // A clarification or an assistant reply immediately after the question
    // means the router opened no Investigation for it -- a clarification
    // because it declined to route, a reply because it wasn't a business
    // question at all (ADR-0033). Either way, this question gets no answer
    // entry, and the next Investigation in the array belongs to a later one.
    const next = thread.messages[index + 1];
    if (next && (next.kind === 'router_clarification' || next.kind === 'assistant_reply')) return;
```

- [ ] **Step 3: Add rendering for `assistant_reply` in `chat-message-row.tsx`.** Read the file first — it almost certainly already has a branch distinguishing `router_clarification` (rendered with suggestion chips) from a plain user/assistant bubble. `assistant_reply` should render like a plain assistant message (no suggestion chips, no citation affordances — it never has any), reusing whatever the file's default/fallback branch already does for an unrecognized-but-assistant-authored kind, or adding one if the file switches exhaustively on `kind`.

- [ ] **Step 4: Update `types/thread.ts`**'s `ThreadMessage.kind` doc comment — it currently says "the two values the surface renders differently are `user_question` and `router_clarification`"; make it three, naming `assistant_reply`.

- [ ] **Step 5: Run tests, verify in browser** — send a non-analytical message ("thanks!") in a running instance, confirm the reply renders as a normal assistant bubble with no citation/suggestion UI, and confirm a real business question asked afterward in the same Chat Session still gets its own correct answer (not an off-by-one pairing).

- [ ] **Step 6: Commit**

```bash
git add apps/zentra-os
git commit -m "fix(zentra-os): render assistant_reply messages and fix Investigation pairing"
```

---

### Task 3: Composer is never disabled by an in-flight Analysis Run

**Files:**
- Modify: `apps/zentra-os/src/app/pages/chat/chat-composer.tsx`
- Modify: `apps/zentra-os/src/app/pages/chat/chat-page.tsx`

**Interfaces:** none new — this is a copy/behavior fix, not a shape change.

`ThreadActions.can_append_message` now stays `true` while an Investigation runs (fixed server-side, PR #100) — but `chat-composer.tsx`'s placeholder text still reads "Waiting for the current investigation to finish…" whenever `disabled` is true, and `chat-page.tsx`'s `canSend` computation and the composer's `disabled` prop were written against the old always-blocking assumption. Read both files' current `disabled`/`canSend` logic directly before editing (it may already be correct now that the server flag is fixed — the fix here is likely just the stale placeholder copy, which no longer describes any reachable state once `can_append_message` behaves correctly). Confirm by tracing: `disabled={send.isPending || !canSend}` in `chat-page.tsx`, `canSend = thread ? thread.actions.can_append_message : Boolean(projectId)` — since `can_append_message` is now always `true` for a non-archived Thread, `disabled` is only ever `true` while a message is actually in flight (`send.isPending`), which is correct and needs no logic change.

- [ ] **Step 1: Update the placeholder text** in `chat-composer.tsx`:

```typescript
          placeholder={disabled ? 'Sending…' : 'Ask a governed question…'}
```

- [ ] **Step 2: Verify in browser.** Send a question, and while its Analysis Run is still visibly in progress (before a Finding appears), send a second, unrelated question. Confirm the composer accepts it immediately and both questions end up answered independently — this is the actual end-to-end proof that PR #98 (Task 4) and PR #100 together work through the UI, not just through direct API calls.

- [ ] **Step 3: Commit**

```bash
git add apps/zentra-os
git commit -m "fix(zentra-os): remove the stale 'waiting for investigation' composer copy"
```

---

### Task 4: Composer power-user commands

**Files:**
- Modify: `apps/zentra-os/src/app/pages/chat/chat-composer.tsx`
- Create: `apps/zentra-os/src/app/pages/chat/composer-commands.ts`
- Modify: `apps/zentra-os/src/app/pages/chat/chat-page.tsx`
- Modify: `apps/zentra-os/src/app/pages/chat/api.ts`
- Test: `apps/zentra-os/src/app/pages/chat/composer-commands.spec.ts`

**Interfaces:**
- Produces: `parseComposerCommands(draft: string): { text: string; datasetHint: string | null; mentions: readonly string[]; skillHint: string | null }` — pure function, no I/O. Consumed by `chat-page.tsx`'s `submit`.

Per ADR-0032: `#dataset` sets that message's Data Source override, `@user` notifies a member (no permission change), `/skill` names a capability directly. None bypass governance — `/skill` is a hint that still routes through Intake. This plan implements the parsing and the wire-through of `#dataset` (the only one with a real backend effect today — Plan 2's `default_data_connection_id` and the existing `data_connection_id` message parameter); `@user` and `/skill` are parsed and visually acknowledged in the composer but have no backend counterpart yet (no notification system, and Intake has no "hint" input parameter) — call this out explicitly in the PR rather than silently no-op'ing without comment.

- [ ] **Step 1: Write `composer-commands.ts`**:

```typescript
/**
 * Parses `#dataset`, `@user`, and `/skill` out of a composer draft (ADR-0032).
 *
 * None of these bypass governance: `#dataset` only supplies the same
 * `data_connection_id` a message could already carry; `/skill` is a hint
 * Intake still validates against the Analytical Scope, not a direct dispatch
 * (rejected explicitly in ADR-0032 for exactly that reason). `@user` has no
 * backend effect yet -- there is no notification system to wire it to -- so
 * it is parsed and shown, not acted on.
 */

const HASH_TAG = /#([a-zA-Z0-9_-]+)/g;
const AT_MENTION = /@([a-zA-Z0-9_-]+)/g;
const SLASH_SKILL = /^\/([a-zA-Z0-9_-]+)\s?/;

export interface ParsedComposerDraft {
  /** The draft with every recognized command token removed. */
  readonly text: string;
  readonly datasetHint: string | null;
  readonly mentions: readonly string[];
  readonly skillHint: string | null;
}

export const parseComposerCommands = (draft: string): ParsedComposerDraft => {
  const skillMatch = SLASH_SKILL.exec(draft);
  const skillHint = skillMatch ? skillMatch[1] : null;
  let text = skillHint ? draft.slice(skillMatch![0].length) : draft;

  const mentions = [...text.matchAll(AT_MENTION)].map((match) => match[1]);
  const datasetMatches = [...text.matchAll(HASH_TAG)];
  const datasetHint = datasetMatches.length > 0 ? datasetMatches[0][1] : null;

  text = text.replace(HASH_TAG, '').replace(AT_MENTION, '').trim();

  return { text, datasetHint, mentions, skillHint };
};
```

- [ ] **Step 2: Write the test** covering: a plain message with no commands round-trips unchanged; `#dataset` is extracted and stripped; `@user` is extracted and stripped without altering the rest of the text; `/skill` only matches at the start of the message (a mid-sentence `/` is left alone); multiple commands in one message all extract correctly.

- [ ] **Step 3: Wire `#dataset` through to the API.** `chat-page.tsx`'s `submit`/`send.mutate` currently sends only `content`. Check `appendMessage`/`createChat` in `api.ts` — Plan 2 added `chat_sessions.default_data_connection_id`, set via a dedicated repository method, not a per-message parameter; there is no existing route to set it directly from the frontend. Add one:

```typescript
// api.ts
export const setChatDataset = (getToken: TokenSource, threadId: string, dataSourceId: string) =>
  requestJson<Thread>(`/v1/chats/${threadId}/dataset`, getToken, post({ data_source_id: dataSourceId }));
```

This requires a new backend route (`PATCH /v1/chats/{chat_id}/dataset` or similar) that Plan 2 did not add — Plan 2 only added the repository method (`set_default_data_connection_id`), not an HTTP route calling it. **Stop and flag this explicitly rather than guessing the wiring**: either add the small route + schema in this task (touching `apps/api/src/zentra_api/chat_routes.py`, mirroring the existing route/error-handling pattern in that file exactly), or resolve `#dataset`'s value against a client-side dataset-name lookup only, defer the actual `default_data_connection_id` write to a later plan, and say so in the PR description. Pick the former if the router addition is small and low-risk (it should be: one route, one Pydantic request schema, one repository call already implemented); pick the latter only if it turns out to need more backend design than expected.

- [ ] **Step 4: Update `chat-composer.tsx`** to call `parseComposerCommands` on submit and surface `datasetHint` as a small inline chip above the textarea (visual treatment: match the existing `Badge` component usage already in `investigation-controls.tsx` for consistency, `intent="info"` or similar, not a new visual pattern). `@user`/`skillHint` render as chips too, informational, no backend call yet — say so in a `title`/tooltip attribute so a curious user isn't left wondering why nothing happened.

- [ ] **Step 5: Verify in browser.** Type a message containing `#SomeDataset @teammate /some-skill some question`, confirm the chips render, confirm the stripped `text` is what actually gets sent as the message content, confirm (if Step 3 added the route) that a subsequent message without `#dataset` still resolves against the session's now-set default.

- [ ] **Step 6: Commit**

```bash
git add apps/zentra-os apps/api  # if Step 3 touched the backend
git commit -m "feat(zentra-os): composer #dataset/@user//skill commands (ADR-0032)"
```

---

### Task 5: Resizable Activity Inspector

**Files:**
- Create: `apps/zentra-os/src/app/pages/chat/activity-inspector.tsx`
- Create: `apps/zentra-os/src/app/pages/chat/use-resizable-panel.ts`
- Modify: `apps/zentra-os/src/app/pages/chat/chat-page.tsx`
- Modify: `apps/zentra-os/src/app/pages/chat/agent-progress.tsx` (only its export surface — its `progressLines` logic is unchanged and reused)
- Test: `apps/zentra-os/src/app/pages/chat/use-resizable-panel.spec.ts`, extend `chat.spec.tsx`

**Interfaces:**
- Produces: `<ActivityInspector events={...} status={...} agents={...} open={...} onClose={...} />` (desktop: resizable right panel; mobile: bottom drawer, same props, different chrome via a CSS breakpoint or a `useMediaQuery`-style hook if this codebase already has one — `grep -rn "useMediaQuery\|matchMedia" apps/zentra-os/src` first).
- `useResizablePanel(options: { defaultWidth: number; minWidth: number; minRemainingWidth: number })` → `{ width: number; onDragStart: (event: PointerEvent) => void }`, a small generic hook with no chat-specific knowledge, so it is reusable if another resizable panel appears later.

Per ADR-0029: everything the Activity Feed carries stays hidden behind an opt-in panel by default; a pending Human Approval is the one exception and stays inline (already true — `InvestigationControls` is unchanged by this task). `agent-progress.tsx` today renders `AgentProgress` inline in the main timeline, always visible — this task moves it into the new panel instead, closed by default, with a toggle to open it.

- [ ] **Step 1: Write `use-resizable-panel.ts`** — a pointer-drag width hook:

```typescript
import { useCallback, useRef, useState } from 'react';

interface ResizablePanelOptions {
  readonly defaultWidth: number;
  readonly minWidth: number;
  /** The main content's own minimum -- resizing must never shrink it below this. */
  readonly minRemainingWidth: number;
}

export const useResizablePanel = ({
  defaultWidth,
  minWidth,
  minRemainingWidth,
}: ResizablePanelOptions) => {
  const [width, setWidth] = useState(defaultWidth);
  const dragStartX = useRef(0);
  const dragStartWidth = useRef(defaultWidth);

  const onDragStart = useCallback(
    (event: React.PointerEvent) => {
      dragStartX.current = event.clientX;
      dragStartWidth.current = width;

      const onMove = (moveEvent: PointerEvent) => {
        const delta = dragStartX.current - moveEvent.clientX;
        const maxWidth = window.innerWidth - minRemainingWidth;
        setWidth(Math.min(maxWidth, Math.max(minWidth, dragStartWidth.current + delta)));
      };
      const onUp = () => {
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
      };
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
    },
    [width, minWidth, minRemainingWidth],
  );

  return { width, onDragStart };
};
```

- [ ] **Step 2: Write the test** for `useResizablePanel` — mount it with `@testing-library/react`'s `renderHook`, simulate `pointerdown`/`pointermove`/`pointerup` on `window`, assert width tracks the drag and clamps at `minWidth`. Check this codebase's existing hook-test pattern first (`use-thread-events.spec.tsx` tests a hook already — match its structure/mocking style, e.g. `EventSource`/`fetch` mocking conventions if any translate).

- [ ] **Step 3: Write `activity-inspector.tsx`**:

```typescript
import { IconButton } from '@open-zentra/foundation-design-system';
import { Icon } from '@open-zentra/foundation-icons';

import type { Agent, ThreadEvent } from '../../types';
import { AgentProgress } from './agent-progress';
import type { FeedStatus } from './use-thread-events';
import { useResizablePanel } from './use-resizable-panel';

const DEFAULT_WIDTH = 360;
const MIN_WIDTH = 280;
const MIN_CHAT_WIDTH = 480;

interface ActivityInspectorProps {
  readonly events: readonly ThreadEvent[];
  readonly status: FeedStatus;
  readonly agents: readonly Agent[];
  readonly open: boolean;
  readonly onClose: () => void;
}

/**
 * Everything the Activity Feed carries, hidden by default (ADR-0029).
 *
 * Desktop: a resizable right panel, `min-width` enforced on both itself and
 * the remaining chat area so neither can be dragged to nothing. Mobile: a
 * bottom drawer at a fixed height -- resizing a drawer by dragging its top
 * edge is a worse interaction than just giving it a sensible fixed height on
 * a screen too narrow to resize meaningfully anyway.
 */
export const ActivityInspector = ({ events, status, agents, open, onClose }: ActivityInspectorProps) => {
  const { width, onDragStart } = useResizablePanel({
    defaultWidth: DEFAULT_WIDTH,
    minWidth: MIN_WIDTH,
    minRemainingWidth: MIN_CHAT_WIDTH,
  });

  if (!open) return null;

  return (
    <>
      {/* Desktop: resizable right panel */}
      <div
        className="hidden h-full flex-col border-l border-border bg-card md:flex"
        style={{ width }}
      >
        <div
          className="w-1 shrink-0 cursor-col-resize self-stretch hover:bg-primary/20"
          onPointerDown={onDragStart}
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize the activity panel"
        />
        <InspectorHeader onClose={onClose} />
        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          <AgentProgress events={events} status={status} agents={agents} />
        </div>
      </div>

      {/* Mobile: bottom drawer */}
      <div className="fixed inset-x-0 bottom-0 z-20 flex h-[60vh] flex-col border-t border-border bg-card md:hidden">
        <InspectorHeader onClose={onClose} />
        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          <AgentProgress events={events} status={status} agents={agents} />
        </div>
      </div>
    </>
  );
};

const InspectorHeader = ({ onClose }: { readonly onClose: () => void }) => (
  <div className="flex items-center justify-between border-b border-border px-4 py-3">
    <h2 className="font-mono text-[10px] uppercase tracking-[0.14em] text-foreground-muted">
      Activity
    </h2>
    <IconButton aria-label="Close activity panel" intent="ghost" size="sm" onClick={onClose}>
      <Icon name="x" size="sm" />
    </IconButton>
  </div>
);
```

Verify `Icon` actually exports an `"x"` name and `IconButton` accepts `onClick` before using them as-is — check `@open-zentra/foundation-icons`'s icon list and an existing `IconButton onClick` usage elsewhere in this codebase first (`grep -rn "IconButton" apps/zentra-os/src | grep onClick`).

- [ ] **Step 4: Wire it into `chat-page.tsx`.** Add `const [inspectorOpen, setInspectorOpen] = useState(false)`. Remove the inline `<AgentProgress events={feed.events} status={feed.status} agents={agents.data ?? []} />` from the timeline `.map()` block entirely. Add a toggle button in the page header (near the title) that opens the inspector, and render `<ActivityInspector events={feed.events} status={feed.status} agents={agents.data ?? []} open={inspectorOpen} onClose={() => setInspectorOpen(false)} />` as a sibling to the main `<section>`, inside the existing `<div className="flex h-full min-h-0">` wrapper.

- [ ] **Step 5: Verify in browser at both a desktop and a mobile viewport width** (resize the browser window or use devtools' device toolbar) — confirm the panel opens/closes, resizes by dragging on desktop without either side collapsing below its minimum, and renders as a bottom drawer under a mobile-width viewport. Confirm agent activity that used to always show inline is now hidden until the panel is opened.

- [ ] **Step 6: Commit**

```bash
git add apps/zentra-os
git commit -m "feat(zentra-os): resizable Activity Inspector, hidden by default (ADR-0029)"
```

---

### Task 6: Chat becomes the primary surface

**Files:**
- Modify: `apps/zentra-os/src/app/app.tsx`
- Modify: `apps/zentra-os/src/app/shell/nav-items.ts`
- Modify: `apps/zentra-os/src/app/pages/chat/answer-row.tsx` (add a link out to Analysis Details)
- Test: extend whatever test currently covers routing (`grep -rln "Launcher\|InvestigationWorkspace" apps/zentra-os/src/app/app.spec.tsx` — check if one exists first)

**Interfaces:** none new beyond a `analysisDetailsHref` (or equivalent) prop threaded from `chat-page.tsx` into `AnswerRow`, pointing at the existing `/investigations/:id` route.

Per ADR-0028/the original acceptance criteria: "no Investigation console as primary UI," "Remove or repurpose... Investigation Workspace." `InvestigationWorkspace` (`/investigations/:id`) has real, not-yet-rebuilt-into-Chat functionality (`ApprovalInspector`, `EvidenceSpine`, `EvidenceDeletion`) — deleting it would lose working features this plan does not replace. **Repurpose, not delete**: make `/chat` the default landing route, keep `/investigations/:id` reachable as an "Analysis Details" destination linked from an Analysis Run's answer card (this is exactly the "Analysis Details drawer" the original grilling handoff doc named as a target), and drop the standalone "Investigations" launcher from primary navigation.

- [ ] **Step 1: Swap the default route** in `app.tsx`. Change `<Route path="/" element={<Launcher .../>} />` to render the Chat page (`ChatPage`) instead, and move the Launcher to an explicit path (e.g. `/investigations`) so it stays reachable, not deleted:

```tsx
<Route path="/" element={<ChatPage getToken={getToken} identity={identity.data} />} />
<Route
  path="/investigations"
  element={<Launcher getToken={getToken} identity={identity.data} />}
/>
<Route
  path="/investigations/:id"
  element={<InvestigationWorkspace getToken={getToken} />}
/>
```

Remove the now-redundant separate `/chat` route (or keep it as an alias redirecting to `/`, your call — check whether anything else in the codebase links to `/chat` by path string first: `grep -rn "'/chat'" apps/zentra-os/src`).

- [ ] **Step 2: Update `nav-items.ts`.** Remove the standalone `Investigations` entry (or fold it into a less prominent position — this plan's call: remove it from the primary rail, since Chat is now `/` and the launcher is reachable via an Analysis Details link, not a top-level destination). Update the `Chat` item's `to` if it changed, and its `matches` array to cover `/investigations` for back-compat highlighting if a user lands there directly.

- [ ] **Step 3: Add the Analysis Details link.** In `answer-row.tsx`, read the file first to see how it renders an `Investigation`'s answer — add a small link/button ("Analysis details") pointing at `/investigations/${investigation.investigation_id}`, likely near wherever citations or the Investigation's status already render.

- [ ] **Step 4: Verify in browser.** Load `/`, confirm it's the chat surface, not the old launcher. Navigate to an Analysis Run's "Analysis details" link, confirm `InvestigationWorkspace` still renders correctly at `/investigations/:id`. Confirm `/investigations` (no id) still reaches the old launcher.

- [ ] **Step 5: Commit**

```bash
git add apps/zentra-os
git commit -m "feat(zentra-os): make Chat the primary surface, Investigation launcher secondary"
```

---

### Task 7: Reskin the inline approval card's vocabulary

**Files:**
- Modify: `apps/zentra-os/src/app/pages/chat/investigation-controls.tsx`

**Interfaces:** none — labels/copy only, no prop or behavior change.

`InvestigationControls` is already the one deliberate exception ADR-0029 calls for (a pending Human Approval surfaces inline, not behind the Activity Inspector) — this task is copy-only, matching the Chat Session/Analysis Run vocabulary everywhere else now uses.

- [ ] **Step 1: Rename user-facing copy only** (not the component/file name, not prop names, not the imported `cancelInvestigation`/`retryInvestigation`/`decideApproval` API functions, which are unchanged per this plan's Global Constraints): `"Stop this investigation"` → `"Stop this analysis"`, `"Try again"` stays (already vocabulary-neutral), the module docstring's references to "Investigation" in prose (not code identifiers) updated to "Analysis Run" where it reads naturally.

- [ ] **Step 2: Verify in browser** against a Chat Session that reaches an approval gate — confirm the card still renders inline in the chat flow (not in the Activity Inspector) and reads correctly.

- [ ] **Step 3: Commit**

```bash
git add apps/zentra-os
git commit -m "docs(zentra-os): Chat Session vocabulary in the inline approval card"
```

---

## Final Verification

```bash
pnpm nx test zentra-os
pnpm nx lint zentra-os
```

Then, with `apps/api` running against a freshly-migrated Postgres (`docker compose up -d --wait control-postgres`, `alembic upgrade head`) and the frontend dev server running:

1. Load `/` — confirm it's the chat surface.
2. Send a business question, confirm it resolves and produces an answer.
3. While that Analysis Run is still visibly in progress, send a second, unrelated question — confirm the composer accepts it (Task 3/PR #100's real proof).
4. Send "thanks!" — confirm it gets a plain conversational reply, not a router clarification, and a subsequent real question after it still answers correctly (Task 2's regression coverage).
5. Try `#dataset @user /skill some question` in the composer — confirm the chips render and the sent message content is clean.
6. Open the Activity Inspector, resize it on desktop, confirm it renders as a bottom drawer on a mobile-width viewport.
7. Reach an approval gate, confirm the inline card still renders and reads correctly.
8. Click through to Analysis Details from an answer, confirm the Investigation Workspace still works.

This is the bar for Plan 4 being done — a genuinely working, ADR-compliant chat surface, verified live, not just green unit tests.
