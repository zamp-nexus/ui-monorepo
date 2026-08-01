import { useEffect, useRef, useState } from 'react';

import { Badge } from '@open-zentra/foundation-design-system';

import type { ChatMessage, ChatThread, IdentityContext } from '../../types';
import { ChatComposer } from './chat-composer';
import { ChatEmptyState } from './chat-empty-state';
import { ChatHistory } from './chat-history';
import { ChatMessageRow } from './chat-message-row';
import { chatSuggestions, mockAssistantReply, mockThreads } from './mock-chat-data';

const NEW_THREAD_ID = 'new';

/** Only until the API mints them. */
const localId = () => `local-${Math.random().toString(36).slice(2, 10)}`;

/**
 * The conversational surface.
 *
 * Every thread and every answer on this page comes from `mock-chat-data.ts`.
 * It is labelled as a fixture on screen rather than left to look live, because
 * a chat that answers convincingly and knows nothing is the one thing a
 * governed product cannot ship by accident.
 */
export const ChatPage = ({ identity }: { readonly identity: IdentityContext }) => {
  const [threads, setThreads] = useState<readonly ChatThread[]>(mockThreads);
  const [activeThreadId, setActiveThreadId] = useState<string>(NEW_THREAD_ID);
  const [draft, setDraft] = useState('');
  const [answering, setAnswering] = useState(false);
  const endOfThread = useRef<HTMLDivElement>(null);

  const activeThread = threads.find((thread) => thread.thread_id === activeThreadId) ?? null;
  const messages = activeThread?.messages ?? [];

  useEffect(() => {
    endOfThread.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages.length, answering]);

  const appendToThread = (threadId: string, message: ChatMessage) =>
    setThreads((current) =>
      current.map((thread) =>
        thread.thread_id === threadId
          ? {
              ...thread,
              updated_at: message.created_at,
              messages: [...thread.messages, message],
            }
          : thread,
      ),
    );

  const send = (content: string) => {
    const now = new Date().toISOString();
    const question: ChatMessage = {
      message_id: localId(),
      role: 'user',
      content,
      created_at: now,
      investigation_id: null,
    };

    let threadId = activeThreadId;
    if (threadId === NEW_THREAD_ID) {
      threadId = localId();
      setThreads((current) => [
        {
          thread_id: threadId,
          title: content.slice(0, 60),
          updated_at: now,
          messages: [question],
        },
        ...current,
      ]);
      setActiveThreadId(threadId);
    } else {
      appendToThread(threadId, question);
    }

    setDraft('');
    setAnswering(true);

    // Stands in for the round trip, so the pending state is real UI rather
    // than something only a future integration would exercise.
    window.setTimeout(() => {
      appendToThread(threadId, {
        message_id: localId(),
        role: 'assistant',
        content: mockAssistantReply(content),
        created_at: new Date().toISOString(),
        investigation_id: null,
      });
      setAnswering(false);
    }, 600);
  };

  const greetingName = identity.email.split('@')[0];

  return (
    <div className="flex h-full min-h-0">
      <ChatHistory
        threads={threads}
        activeThreadId={activeThread ? activeThread.thread_id : null}
        onSelect={(threadId) => {
          setActiveThreadId(threadId);
          setDraft('');
        }}
        onNewChat={() => {
          setActiveThreadId(NEW_THREAD_ID);
          setDraft('');
        }}
      />

      <section className="flex min-w-0 flex-1 flex-col">
        <header className="flex flex-wrap items-baseline gap-x-4 gap-y-2 border-b border-border px-6 py-5">
          <h1 className="font-serif text-2xl font-normal tracking-[-0.03em]">Chat</h1>
          <Badge intent="warning" size="sm">
            Fixture · not connected
          </Badge>
          <p className="w-full text-sm text-foreground-muted">
            Ask a governed question and follow the evidence trace it produces.
          </p>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {messages.length === 0 ? (
            <ChatEmptyState
              greetingName={greetingName}
              suggestions={chatSuggestions}
              onChoose={(prompt) => setDraft(prompt)}
            />
          ) : (
            <div className="mx-auto flex max-w-3xl flex-col gap-8 px-6 py-8">
              {messages.map((message) => (
                <ChatMessageRow key={message.message_id} message={message} />
              ))}
              {answering ? (
                <p
                  className="font-mono text-[10px] uppercase tracking-[0.14em] text-foreground-muted"
                  aria-live="polite"
                >
                  Reading governed metrics…
                </p>
              ) : null}
              <div ref={endOfThread} />
            </div>
          )}
        </div>

        <ChatComposer
          draft={draft}
          onDraftChange={setDraft}
          onSend={send}
          disabled={answering}
        />
      </section>
    </div>
  );
};
