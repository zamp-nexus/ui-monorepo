import { useEffect, useRef, useState } from 'react';

import { AssistantRuntimeProvider, ThreadPrimitive } from '@assistant-ui/react';
import { useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';

import { IconButton } from '@open-zentra/foundation-design-system';
import { Icon } from '@open-zentra/foundation-icons';

import { requestJson, type TokenSource } from '../../api';
import type { CatalogSummary, IdentityContext, ThreadEvent } from '../../types';
import { ActivityInspector } from './activity-inspector';
import { getChat, listAgents, listChats } from './api';
import { ChatComposer } from './chat-composer';
import { ChatContextProvider } from './chat-context';
import { ChatEmptyState } from './chat-empty-state';
import { ChatHistory } from './chat-history';
import { AssistantMessage, UserMessage } from './chat-messages';
import { useChatRuntime } from './chat-runtime';
import { suggestionsFromCatalog } from './chat-suggestions';
import { useActiveGroup } from './use-active-group';
import { useSendMessage } from './use-send-message';
import { useThreadEvents } from './use-thread-events';

/** The composer is open but no Thread exists yet — the first message makes one. */
const NEW_THREAD = null;

/**
 * The conversational surface.
 *
 * The shape of the loop is the one the Thread API asks for: read the snapshot,
 * then tail the Work Feed from the cursor it hands over. The stream drives
 * *progress* — which agent is working, what it just said — and the snapshot
 * remains the only source of *content*. That split is deliberate. An event
 * cannot be un-received, so treating the feed as state would mean a dropped
 * connection silently changing what the reader believes.
 */
export const ChatPage = ({
  identity,
  getToken,
}: {
  readonly identity: IdentityContext;
  readonly getToken: TokenSource;
}) => {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { chatId } = useParams();
  // The URL is the source of truth for which Thread is open (`/chats` vs
  // `/chats/:chatId`) -- there is no separate local copy of this to drift
  // out of sync with it.
  const activeThreadId = chatId ?? NEW_THREAD;
  const [draft, setDraft] = useState('');
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const endOfThread = useRef<HTMLDivElement>(null);

  const group = useActiveGroup(getToken);
  const groupId = group.data ?? null;

  const history = useInfiniteQuery({
    queryKey: ['threads', groupId],
    queryFn: ({ pageParam }) => listChats(getToken, groupId as string, pageParam),
    initialPageParam: null as string | null,
    getNextPageParam: (page) => page.next_cursor,
    enabled: Boolean(groupId),
  });

  const snapshot = useQuery({
    queryKey: ['thread', activeThreadId],
    queryFn: () => getChat(getToken, activeThreadId as string),
    enabled: Boolean(activeThreadId),
  });

  const agents = useQuery({
    queryKey: ['agents'],
    queryFn: () => listAgents(getToken),
    staleTime: 5 * 60 * 1000,
  });

  const catalog = useQuery({
    queryKey: ['catalog'],
    queryFn: () => requestJson<CatalogSummary>('/v1/catalog', getToken),
    staleTime: 5 * 60 * 1000,
  });

  const thread = snapshot.data ?? null;

  // A finished Finding, a rendered view, or a decided approval all mean the
  // snapshot is now behind what the feed already knows. Refetch rather than
  // patch: the server's version of the Thread is the one that counts.
  const onEvent = (event: ThreadEvent) => {
    const settles =
      event.kind === 'finding.published' ||
      event.kind === 'approval.requested' ||
      event.kind === 'approval.decided' ||
      event.kind === 'thread.message_added' ||
      event.kind === 'thread.routing_clarification' ||
      event.kind === 'thread.routing_resolved' ||
      event.kind.startsWith('visualization.') ||
      event.kind.startsWith('analysis_run.');
    if (!settles) return;
    void queryClient.invalidateQueries({ queryKey: ['thread', event.thread_id] });
    if (event.kind === 'visualization.completed' || event.kind === 'visualization.failed') {
      void queryClient.invalidateQueries({ queryKey: ['visualization'] });
    }
  };

  const feed = useThreadEvents(getToken, activeThreadId, thread?.event_cursor ?? 0, onEvent);

  // `replace: true` -- a send from the bare `/chats` composer is establishing
  // this thread's canonical URL, not a user-initiated navigation. A normal
  // push would leave `/chats` sitting in history as a dead back-button stop
  // for every message ever sent from the empty composer.
  const send = useSendMessage(getToken, queryClient, (threadId) =>
    navigate(`/chats/${threadId}`, { replace: true }),
  );

  const submit = (content: string) => {
    setDraft('');
    void send.send({ threadId: activeThreadId, groupId, content });
  };

  const runtime = useChatRuntime({
    thread,
    pendingUserMessage: send.pendingUserMessage,
    streaming: send.streaming,
    isSending: send.isPending,
    onSend: submit,
  });

  useEffect(() => {
    endOfThread.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [thread?.messages.length, feed.events.length, send.streaming?.text]);

  const threads = history.data?.pages.flatMap((page) => page.items) ?? [];
  // Before a Thread exists there is nothing to forbid; afterwards the server
  // says when a follow-up is legal, and it is the only thing that says so.
  const canSend = thread ? thread.actions.can_append_message : Boolean(groupId);

  if (group.error) {
    return (
      <section className="flex h-full items-center justify-center px-6">
        <p className="max-w-md text-sm text-foreground-muted" role="alert">
          {group.error.message}
        </p>
      </section>
    );
  }

  return (
    <div className="flex h-full min-h-0">
      <ChatHistory
        threads={threads}
        activeThreadId={activeThreadId}
        loading={history.isFetching}
        onLoadMore={history.hasNextPage ? () => void history.fetchNextPage() : null}
        onSelect={(threadId) => {
          navigate(`/chats/${threadId}`);
          setDraft('');
        }}
        onNewChat={() => {
          navigate('/chats');
          setDraft('');
        }}
      />

      <section className="flex min-w-0 flex-1 flex-col">
        <header className="flex flex-wrap items-baseline gap-x-4 gap-y-2 border-b border-border px-6 py-5">
          <h1 className="min-w-0 flex-1 font-serif text-2xl font-normal tracking-[-0.03em]">
            {thread?.title ?? 'Chat'}
          </h1>
          <IconButton
            aria-label={inspectorOpen ? 'Close activity panel' : 'Open activity panel'}
            aria-pressed={inspectorOpen}
            intent="ghost"
            size="sm"
            onClick={() => setInspectorOpen((value) => !value)}
          >
            <Icon name="sidebar" size="sm" />
          </IconButton>
          <p className="w-full text-sm text-foreground-muted">
            Ask a governed question and follow the evidence trace it produces.
          </p>
        </header>

        <div className="relative min-h-0 flex-1 flex flex-col">
          <div className="min-h-0 flex-1 overflow-y-auto pb-40">
            <ChatContextProvider value={{ getToken, onFollowUp: submit, onFillComposer: setDraft }}>
            <AssistantRuntimeProvider runtime={runtime}>
              <ThreadPrimitive.Root>
                <ThreadPrimitive.Empty>
                  <ChatEmptyState
                    greetingName={identity.email.split('@')[0]}
                    suggestions={suggestionsFromCatalog(catalog.data ?? null)}
                    onChoose={setDraft}
                  />
                </ThreadPrimitive.Empty>

                <ThreadPrimitive.If empty={false}>
                  <ThreadPrimitive.Viewport className="mx-auto flex max-w-3xl flex-col gap-8 px-6 py-8">
                    <ThreadPrimitive.Messages components={{ UserMessage, AssistantMessage }} />

                    {send.error ? (
                      <p className="text-sm text-danger" role="alert">
                        {send.error.message}
                      </p>
                    ) : null}

                    <div ref={endOfThread} />
                  </ThreadPrimitive.Viewport>
                </ThreadPrimitive.If>
              </ThreadPrimitive.Root>
            </AssistantRuntimeProvider>
          </ChatContextProvider>
        </div>

          <div className="absolute bottom-8 left-1/2 w-full max-w-3xl -translate-x-1/2 px-6 pointer-events-none">
            <div className="pointer-events-auto shadow-2xl rounded-3xl overflow-hidden">
              <ChatComposer
                draft={draft}
                onDraftChange={setDraft}
                onSend={submit}
                disabled={send.isPending || !canSend}
              />
            </div>
          </div>
        </div>
      </section>

      <ActivityInspector
        events={feed.events}
        status={feed.status}
        agents={agents.data ?? []}
        open={inspectorOpen}
        onClose={() => setInspectorOpen(false)}
      />
    </div>
  );
};
