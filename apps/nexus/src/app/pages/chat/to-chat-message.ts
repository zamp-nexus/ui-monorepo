/**
 * Turning a Thread snapshot into the entries the chat surface renders.
 *
 * The important thing this file encodes: **an answer is not a message.** The
 * server never appends an agent-authored turn when a Finding is published — a
 * resolved Thread holds exactly the user's question, and everything the agents
 * produced lives on `thread.investigations`. Rendering only `messages` shows a
 * question and nothing else, which is precisely what a reader must not see.
 *
 * So the timeline interleaves the two. Messages carry no Investigation id, so
 * the association is positional: the router opens exactly one Investigation for
 * each question it resolves, and answers a question it cannot resolve with a
 * `router_clarification` instead. Walking the messages in order and consuming
 * one Investigation per resolved question reproduces the server's own pairing
 * without inventing a link the API does not state.
 */

import type { ThreadMessageLike } from '@assistant-ui/react';

import type { ChatMessage, Thread, ThreadActions, ThreadInvestigation } from '../../types';

export interface MessageEntry {
  readonly kind: 'message';
  readonly id: string;
  readonly message: ChatMessage;
}

export interface AnswerEntry {
  readonly kind: 'answer';
  readonly id: string;
  readonly investigation: ThreadInvestigation;
}

export type TimelineEntry = MessageEntry | AnswerEntry;

/** What the `router-clarification` tool-call part carries. */
export interface RouterClarificationResult {
  readonly text: string;
  readonly suggestions: readonly string[];
}

/**
 * What the `investigation-finding` tool-call part carries.
 *
 * `threadActions` and `isLatest` travel with every Finding rather than only
 * the latest one so the renderer can decide for itself whether cancel/retry
 * belong on this particular entry -- exactly one Finding, the most recent,
 * ever shows them, matching the single Analysis Run those flags actually
 * describe.
 */
export interface InvestigationFindingResult {
  readonly threadId: string;
  readonly investigation: ThreadInvestigation;
  readonly isLatest: boolean;
  readonly threadActions: ThreadActions;
}

const toChatMessage = (
  message: Thread['messages'][number],
  investigationId: string | null,
): ChatMessage => ({
  message_id: message.message_id,
  // Derived: the API reports who wrote it, not a role.
  role: message.authored_by_user ? 'user' : 'assistant',
  kind: message.kind,
  content: message.content,
  created_at: message.created_at,
  investigation_id: investigationId,
});

export const toTimeline = (thread: Thread): readonly TimelineEntry[] => {
  const entries: TimelineEntry[] = [];
  let attempt = 0;

  thread.messages.forEach((message, index) => {
    entries.push({
      kind: 'message',
      id: message.message_id,
      message: toChatMessage(message, null),
    });

    if (!message.authored_by_user) return;

    // A clarification or an assistant reply immediately after the question
    // means the router opened no Investigation for it -- a clarification
    // because it declined to route, a reply because it wasn't a business
    // question at all (ADR-0033). Either way, this question gets no answer
    // entry, and the next Investigation in the array belongs to a later one.
    const next = thread.messages[index + 1];
    if (next && (next.kind === 'router_clarification' || next.kind === 'assistant_reply')) return;

    const investigation = thread.investigations[attempt];
    if (!investigation) return;
    attempt += 1;
    entries.push({
      kind: 'answer',
      id: investigation.investigation_id,
      investigation,
    });
  });

  return entries;
};

/** The Investigation the surface should be showing controls for. */
export const latestInvestigation = (thread: Thread) =>
  thread.investigations.length > 0 ? thread.investigations[thread.investigations.length - 1] : null;

/**
 * `toTimeline`'s entries, reshaped into assistant-ui's message model.
 *
 * A Finding is still not a message -- `toTimeline` above is what keeps that
 * true. This only retargets its output: an "answer" entry becomes a
 * synthesized assistant message whose one content part is an
 * `investigation-finding` tool call carrying the whole Investigation, and a
 * `router_clarification` message becomes a `router-clarification` tool call
 * carrying its text and the current suggestions -- both routed to their own
 * renderer via `MessagePrimitive.Content`'s `tools.by_name`, the same
 * mechanism a real tool call would use.
 */
export const toAssistantMessages = (thread: Thread): readonly ThreadMessageLike[] => {
  const entries = toTimeline(thread);
  const latest = latestInvestigation(thread);

  return entries.map((entry): ThreadMessageLike => {
    if (entry.kind === 'answer') {
      const result: InvestigationFindingResult = {
        threadId: thread.thread_id,
        investigation: entry.investigation,
        isLatest: latest?.investigation_id === entry.investigation.investigation_id,
        threadActions: thread.actions,
      };
      return {
        id: entry.investigation.investigation_id,
        role: 'assistant',
        createdAt: new Date(entry.investigation.created_at),
        content: [
          {
            type: 'tool-call',
            toolCallId: entry.investigation.investigation_id,
            toolName: 'investigation-finding',
            args: { investigationId: entry.investigation.investigation_id },
            result,
          },
        ],
      };
    }

    const { message } = entry;
    if (message.kind === 'router_clarification') {
      const result: RouterClarificationResult = {
        text: message.content,
        suggestions: thread.routing?.suggestions ?? [],
      };
      return {
        id: message.message_id,
        role: 'assistant',
        createdAt: new Date(message.created_at),
        content: [
          {
            type: 'tool-call',
            toolCallId: message.message_id,
            toolName: 'router-clarification',
            args: {},
            result,
          },
        ],
      };
    }

    return {
      id: message.message_id,
      role: message.role,
      createdAt: new Date(message.created_at),
      content: [{ type: 'text', text: message.content }],
    };
  });
};
