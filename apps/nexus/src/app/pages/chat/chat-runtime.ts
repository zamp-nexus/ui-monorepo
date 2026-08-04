import { useMemo } from 'react';

import { useExternalStoreRuntime, type ThreadMessageLike } from '@assistant-ui/react';

import type { Thread } from '../../types';
import { toAssistantMessages } from './to-chat-message';
import type { PendingUserMessage, StreamingReply } from './use-send-message';

const hasText = (message: ThreadMessageLike, text: string): boolean =>
  Array.isArray(message.content) &&
  message.content.length === 1 &&
  message.content[0]?.type === 'text' &&
  message.content[0].text === text;

/**
 * The runtime backing the chat surface: `thread` (from React Query) plus
 * `use-send-message`'s local, pre-network state are the entire message
 * history, reshaped into `ThreadMessageLike[]` by `toAssistantMessages`.
 *
 * `onNew` exists because `ExternalStoreAdapter` requires it, but sending
 * itself does not run through it -- the composer already calls `onSend`
 * directly, exactly as it did before this surface used assistant-ui, so
 * nothing about how a message actually gets sent changed here.
 */
export const useChatRuntime = ({
  thread,
  pendingUserMessage,
  streaming,
  isSending,
  onSend,
}: {
  readonly thread: Thread | null;
  readonly pendingUserMessage: PendingUserMessage | null;
  readonly streaming: StreamingReply | null;
  readonly isSending: boolean;
  readonly onSend: (content: string) => void | Promise<void>;
}) => {
  const messages = useMemo(() => {
    const base = thread ? toAssistantMessages(thread) : [];
    const synthetic: ThreadMessageLike[] = [];

    // Shown from local state set synchronously at send time -- see
    // `use-send-message`'s module docs for why this exists and why it is
    // skipped once the real message (same content, server id) has landed.
    if (
      pendingUserMessage &&
      !base.some((message) => hasText(message, pendingUserMessage.content))
    ) {
      synthetic.push({
        id: pendingUserMessage.messageId,
        role: 'user',
        content: [{ type: 'text', text: pendingUserMessage.content }],
      });
    }

    // The streaming reply is likewise synthetic until the terminal `thread`
    // frame settles the cache and this same message shows up for real.
    if (streaming && !base.some((message) => message.id === streaming.messageId)) {
      synthetic.push({
        id: streaming.messageId,
        role: 'assistant',
        status: { type: 'running' },
        content: [{ type: 'text', text: streaming.text }],
      });
    }

    return synthetic.length === 0 ? base : [...base, ...synthetic];
  }, [thread, pendingUserMessage, streaming]);

  return useExternalStoreRuntime<ThreadMessageLike>({
    messages,
    isRunning: isSending,
    convertMessage: (message) => message,
    onNew: async (message) => {
      const part = message.content[0];
      if (part?.type !== 'text') {
        throw new Error('This composer can only send text.');
      }
      await onSend(part.text);
    },
  });
};
