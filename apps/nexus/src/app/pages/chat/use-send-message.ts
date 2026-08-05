/**
 * Sending a chat message and rendering the assistant's reply as it streams.
 *
 * Reuses `parseSseFrames`, the same low-level reader `useThreadEvents` uses
 * (`fetch` + `response.body.getReader()`, since `EventSource` cannot carry a
 * bearer token) — but this is a one-shot read-to-completion loop, not a
 * reconnecting tail: a dropped connection mid-reply is not resumed. The
 * reply was only ever persisted after the model finished (see
 * `ThreadService._stream_conversational_turn`), so a lost connection cannot
 * corrupt a reply; it is surfaced as a failed send rather than silently
 * appearing successful.
 *
 * The terminal `thread` frame is the same JSON `getChat`/`createChat` always
 * returned — it is what settles the React Query cache. Everything before it
 * (`routing`, `delta`) only ever updates local component state, never the
 * cache: content becomes real once the server says it is real, not before.
 *
 * Two things the network layer alone doesn't get right, both fixed here:
 *
 * 1. Ordering. The user's own question has to be visible the instant `send`
 *    is called — before the network round-trip that would otherwise be the
 *    only thing making it appear. Without that, a fast reply (see below)
 *    renders before the question that prompted it, because the reply's
 *    local `streaming` state updates on the very first `delta` frame while
 *    the question was waiting on a server round-trip. `pendingUserMessage`
 *    is set synchronously, before `fetch` is even called.
 * 2. Perceived pace. A short reply from a fast provider can arrive faster
 *    than a browser paint cycle — technically streamed, but indistinguishable
 *    from a single dump. `streaming.text` is therefore drained from an
 *    internal buffer at a capped reveal rate, decoupled from how bursty the
 *    network actually was; the SSE reader itself still consumes frames as
 *    fast as they arrive; only what a human product to the DOM is paced.
 */

import { useCallback, useEffect, useRef, useState } from 'react';

import type { QueryClient } from '@tanstack/react-query';

import { apiUrl, type TokenSource } from '../../api';
import type { Thread } from '../../types';
import { parseSseFrames } from './sse';

export interface StreamingReply {
  readonly messageId: string;
  readonly text: string;
}

export interface PendingUserMessage {
  readonly messageId: string;
  readonly content: string;
}

interface DeltaFrame {
  readonly message_id: string;
  readonly text: string;
}

interface ErrorFrame {
  readonly message: string;
}

export interface UseSendMessageResult {
  readonly send: (params: {
    readonly threadId: string | null;
    readonly groupId: string | null;
    readonly content: string;
    readonly workflowId?: string;
    readonly workflowVersion?: number | null;
  }) => Promise<void>;
  readonly isPending: boolean;
  readonly error: Error | null;
  /** Shown immediately at send time, before any network round-trip settles it. */
  readonly pendingUserMessage: PendingUserMessage | null;
  /** The in-flight assistant reply, paced for readability — see module docs. */
  readonly streaming: StreamingReply | null;
}

/**
 * Reveal rate: a fixed, human-legible pace by default (`BASE_CHARS_PER_TICK`
 * at `REVEAL_TICK_MS` intervals — a few dozen characters a second, the same
 * order of magnitude a person reads at), *not* proportional to how much text
 * is currently buffered. A proportional "drain the backlog" formula is what
 * this had before, and it was the actual bug behind "looks like it dumps the
 * whole reply at once": for a short answer that arrives faster than one
 * render tick, draining a proportional share of a small backlog empties it
 * in a handful of ticks — technically paced, invisibly fast.
 *
 * The catch-up term only kicks in for a backlog large enough that the fixed
 * pace alone would take longer than `MAX_REVEAL_MS` to clear — long
 * responses still finish revealing in a bounded, reasonable time instead of
 * trailing the network by many seconds.
 */
const REVEAL_TICK_MS = 20;
const BASE_CHARS_PER_TICK = 2;
const MAX_REVEAL_MS = 3000;

export const useSendMessage = (
  getToken: TokenSource,
  queryClient: QueryClient,
  onThreadReady: (threadId: string) => void,
): UseSendMessageResult => {
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [pendingUserMessage, setPendingUserMessage] = useState<PendingUserMessage | null>(null);
  const [streaming, setStreaming] = useState<StreamingReply | null>(null);

  // The reveal pace is driven off refs, not state: it ticks on a timer far
  // more often than a delta frame arrives, and re-running the whole `send`
  // callback identity on every reveal tick would be wasteful and pointless.
  const messageIdRef = useRef<string | null>(null);
  const revealedRef = useRef('');
  const pendingCharsRef = useRef('');
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const requestRef = useRef<AbortController | null>(null);

  const stopReveal = useCallback(() => {
    if (timerRef.current !== null) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const flushReveal = useCallback(() => {
    if (!pendingCharsRef.current) return;
    revealedRef.current += pendingCharsRef.current;
    pendingCharsRef.current = '';
    if (messageIdRef.current) {
      setStreaming({ messageId: messageIdRef.current, text: revealedRef.current });
    }
  }, []);

  const startReveal = useCallback(() => {
    if (timerRef.current !== null) return;
    timerRef.current = setInterval(() => {
      const backlog = pendingCharsRef.current;
      if (!backlog) return;
      const ticksToDeadline = Math.max(1, Math.floor(MAX_REVEAL_MS / REVEAL_TICK_MS));
      const catchUpChars = Math.ceil(backlog.length / ticksToDeadline);
      const take = Math.max(BASE_CHARS_PER_TICK, catchUpChars);
      revealedRef.current += backlog.slice(0, take);
      pendingCharsRef.current = backlog.slice(take);
      if (messageIdRef.current) {
        setStreaming({ messageId: messageIdRef.current, text: revealedRef.current });
      }
    }, REVEAL_TICK_MS);
  }, []);

  // A route change must stop both local updates and the request the browser
  // no longer has a surface to render. The server sees the disconnect too.
  useEffect(
    () => () => {
      requestRef.current?.abort();
      stopReveal();
    },
    [stopReveal],
  );

  const send = useCallback(
    async ({
      threadId,
      groupId,
      content,
      workflowId,
      workflowVersion,
    }: {
      threadId: string | null;
      groupId: string | null;
      content: string;
      workflowId?: string;
    }) => {
      setIsPending(true);
      setError(null);
      setStreaming(null);
      messageIdRef.current = null;
      revealedRef.current = '';
      pendingCharsRef.current = '';

      const optimisticMessageId =
        typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : `pending-${Date.now()}`;
      setPendingUserMessage({ messageId: optimisticMessageId, content });
      let controller: AbortController | null = null;

      try {
        controller = new AbortController();
        requestRef.current = controller;
        const token = await getToken();
        const url = threadId
          ? `${apiUrl}/v1/chats/${threadId}/messages`
          : `${apiUrl}/v1/groups/${groupId}/chats`;
        const response = await fetch(url, {
          method: 'POST',
          signal: controller.signal,
          headers: {
            'Content-Type': 'application/json',
            Accept: 'text/event-stream',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({
            message: content,
            ...(workflowId === 'default-analytics'
              ? { use_default_workflow: true }
              : { workflow_id: workflowId, workflow_version: workflowVersion }),
          }),
        });

        if (!response.ok || !response.body) {
          throw new Error(`Nexus could not send this message (${response.status}).`);
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        let streamError: string | null = null;
        let settledThreadId: string | null = null;

        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const { frames, rest } = parseSseFrames(buffer);
          buffer = rest;

          for (const frame of frames) {
            switch (frame.event) {
              case 'routing': {
                // Routing precedes the durable snapshot. Navigating here
                // unmounts this surface for a new thread and aborts the
                // request before its terminal `thread` frame can settle.
                JSON.parse(frame.data);
                break;
              }
              case 'delta': {
                const payload = JSON.parse(frame.data) as DeltaFrame;
                if (messageIdRef.current !== payload.message_id) {
                  messageIdRef.current = payload.message_id;
                  revealedRef.current = '';
                  pendingCharsRef.current = '';
                }
                pendingCharsRef.current += payload.text;
                startReveal();
                break;
              }
              case 'thread': {
                const detail = JSON.parse(frame.data) as Thread;
                settledThreadId = detail.thread_id;
                queryClient.setQueryData(['thread', detail.thread_id], detail);
                onThreadReady(detail.thread_id);
                break;
              }
              case 'error': {
                const payload = JSON.parse(frame.data) as ErrorFrame;
                streamError = payload.message;
                break;
              }
              default:
                break;
            }
          }
        }

        stopReveal();
        flushReveal();
        if (streamError) throw new Error(streamError);
        if (!settledThreadId) {
          throw new Error('The reply stream ended before Nexus could save the message.');
        }
        if (settledThreadId) {
          void queryClient.invalidateQueries({ queryKey: ['threads', groupId] });
          void queryClient.invalidateQueries({ queryKey: ['workflow-execution', settledThreadId] });
        }
      } catch (caught) {
        setError(
          caught instanceof Error ? caught : new Error('Nexus could not send this message.'),
        );
      } finally {
        if (requestRef.current === controller) requestRef.current = null;
        stopReveal();
        setStreaming(null);
        setPendingUserMessage(null);
        setIsPending(false);
      }
    },
    [getToken, queryClient, onThreadReady, startReveal, stopReveal, flushReveal],
  );

  return { send, isPending, error, pendingUserMessage, streaming };
};
