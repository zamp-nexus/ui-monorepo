import { useEffect, useMemo, useRef, useState } from 'react';

import { Alert, Skeleton } from '@open-zentra/foundation-design-system';
import { useMutation, useQuery } from '@tanstack/react-query';

import type { TokenSource } from '../../api';
import type { ThreadEvent } from '../../types';
import { AgentProgress } from '../chat/agent-progress';
import { appendMessage, getChat } from '../chat/api';
import { ChatComposer } from '../chat/chat-composer';
import { ChatMessageRow } from '../chat/chat-message-row';
import { toTimeline } from '../chat/to-chat-message';
import type { FeedStatus } from '../chat/use-thread-events';

interface SequenceChatPanelProps {
  readonly getToken: TokenSource;
  readonly threadId: string;
  readonly feed: { readonly events: readonly ThreadEvent[]; readonly status: FeedStatus };
}

/**
 * The Investigation Thread scoped to this Sequence.
 *
 * Reuses the same chat primitives the `/chat` surface renders with — a
 * Sequence's thread is an ordinary Investigation Thread, just one this page
 * happens to also render a graph beside. It never renders `AnswerRow` or
 * `InvestigationControls`: nothing routes a Sequence-scoped question to an
 * Investigation, so `thread.investigations` is always empty here.
 */
export const SequenceChatPanel = ({ getToken, threadId, feed }: SequenceChatPanelProps) => {
  const [draft, setDraft] = useState('');
  const endOfThread = useRef<HTMLDivElement>(null);

  const thread = useQuery({
    queryKey: ['thread', threadId],
    queryFn: () => getChat(getToken, threadId),
  });

  const send = useMutation({
    mutationFn: (content: string) => appendMessage(getToken, threadId, content),
  });

  const timeline = useMemo(
    () => (thread.data ? toTimeline(thread.data).filter((entry) => entry.kind === 'message') : []),
    [thread.data],
  );

  useEffect(() => {
    endOfThread.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [timeline.length, feed.events.length]);

  const submit = (content: string) => {
    setDraft('');
    send.mutate(content);
  };

  return (
    <section className="flex min-w-0 flex-1 flex-col border-r border-border">
      <header className="border-b border-border px-6 py-5">
        <h2 className="font-serif text-xl font-normal tracking-[-0.03em]">
          {thread.data?.title ?? 'Sequence chat'}
        </h2>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {thread.isPending ? (
          <div className="flex flex-col gap-3 p-6">
            <Skeleton className="h-16 w-3/4" />
            <Skeleton className="h-16 w-2/3 self-end" />
          </div>
        ) : null}

        {thread.error ? (
          <Alert intent="error" className="m-6" role="alert" title="Chat could not be loaded">
            {thread.error.message}
          </Alert>
        ) : null}

        {thread.data ? (
          <div className="flex flex-col gap-6 p-6">
            {timeline.map((entry) =>
              entry.kind === 'message' ? (
                <ChatMessageRow key={entry.id} message={entry.message} suggestions={[]} onChoose={setDraft} />
              ) : null,
            )}

            <AgentProgress events={feed.events} status={feed.status} agents={[]} />

            {send.error ? (
              <p className="text-sm text-danger" role="alert">
                {send.error.message}
              </p>
            ) : null}

            <div ref={endOfThread} />
          </div>
        ) : null}
      </div>

      <ChatComposer
        draft={draft}
        onDraftChange={setDraft}
        onSend={submit}
        disabled={send.isPending || !thread.data?.actions.can_append_message}
      />
    </section>
  );
};
