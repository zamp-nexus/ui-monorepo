import { useEffect, useMemo, useRef, useState } from 'react';

import { AssistantRuntimeProvider, ThreadPrimitive } from '@assistant-ui/react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocation, useNavigate, useParams } from 'react-router-dom';

import { requestJson, type TokenSource } from '../../api';
import type { CatalogSummary, IdentityContext, ThreadEvent } from '../../types';
import { groupEventsByAnalysisRun } from './agent-activity-block';
import { getChat, getLatestWorkflowExecution, listAgents, renameChat } from './api';
import { ChatComposer } from './chat-composer';
import { ChatThinkingIndicator } from './chat-thinking-indicator';
import { ChatContextProvider } from './chat-context';
import { ChatEmptyState } from './chat-empty-state';
import { AssistantMessage, UserMessage } from './chat-messages';
import { useChatRuntime } from './chat-runtime';
import { suggestionsFromCatalog } from './chat-suggestions';
import { useSendMessage } from './use-send-message';
import { listWorkflows } from '../workflows/api';
import { useThreadEvents } from './use-thread-events';
import { useWorkspace } from '../../shell/app-shell';
import { useMutation } from '@tanstack/react-query';
import { IconButton, Input, Modal } from '@open-zentra/foundation-design-system';
import { Icon } from '@open-zentra/foundation-icons';

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
  const location = useLocation();
  const { chatId } = useParams();
  const { groupId, selectGroup } = useWorkspace();
  const sourceName = new URLSearchParams(location.search).get('sourceName');

  const [isRenameModalOpen, setIsRenameModalOpen] = useState(false);
  const activeThreadId = chatId ?? NEW_THREAD;

  const renameMutation = useMutation({
    mutationFn: (newTitle: string) => renameChat(getToken, activeThreadId as string, newTitle),
    onSuccess: (updatedThread) => {
      queryClient.setQueryData(['thread', activeThreadId], updatedThread);
      void queryClient.invalidateQueries({ queryKey: ['threads', groupId] });
      setIsRenameModalOpen(false);
    },
  });

  const [draft, setDraft] = useState('');
  const [workflowId, setWorkflowId] = useState('auto');
  const [workflowVersion, setWorkflowVersion] = useState<number | null>(null);
  const hydratedWorkflowThread = useRef<string | null>(null);
  const endOfThread = useRef<HTMLDivElement>(null);

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
  const workflows = useQuery({ queryKey: ['workflows'], queryFn: () => listWorkflows(getToken) });
  const workflowExecution = useQuery({
    queryKey: ['workflow-execution', activeThreadId],
    queryFn: () => getLatestWorkflowExecution(getToken, activeThreadId as string),
    enabled: Boolean(activeThreadId),
  });

  const thread = snapshot.data ?? null;

  useEffect(() => {
    if (!activeThreadId) {
      hydratedWorkflowThread.current = null;
      setWorkflowId('auto');
      setWorkflowVersion(null);
      return;
    }
    if (workflowExecution.isLoading || hydratedWorkflowThread.current === activeThreadId) return;
    hydratedWorkflowThread.current = activeThreadId;
    setWorkflowId('auto');
    setWorkflowVersion(null);
  }, [activeThreadId, workflowExecution.data, workflowExecution.isLoading]);

  // A direct link to a chat has no preceding sidebar click. Its owning Group
  // is still the active project, so subsequent New chat actions stay there.
  useEffect(() => {
    if (thread) selectGroup(thread.project_id);
  }, [thread, selectGroup]);

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

  // Grouped once per feed change, not per Analysis Run rendered -- every
  // `analysis-run-finding` tool-call reads its own turn's slice back out by
  // id, the same positional reasoning `to-chat-message.ts` already relies on.
  const activityByRun = useMemo(() => groupEventsByAnalysisRun(feed.events), [feed.events]);

  // `replace: true` -- a send from the bare `/chats` composer is establishing
  // this thread's canonical URL, not a user-initiated navigation. A normal
  // push would leave `/chats` sitting in history as a dead back-button stop
  // for every message ever sent from the empty composer.
  const send = useSendMessage(getToken, queryClient, (threadId) =>
    navigate(`/chats/${threadId}`, { replace: true }),
  );

  const submit = (content: string) => {
    setDraft('');
    const selectedWorkflow = workflows.data?.find((workflow) => workflow.workflow_id === workflowId);
    void send.send({
      threadId: activeThreadId,
      groupId,
      content,
      workflowId,
      workflowVersion: workflowVersion ?? selectedWorkflow?.published_version,
    });
    setWorkflowId('auto');
    setWorkflowVersion(null);
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

  // Before a Thread exists there is nothing to forbid; afterwards the server
  // says when a follow-up is legal, and it is the only thing that says so.
  const canSend = thread ? thread.actions.can_append_message : Boolean(groupId);

  return (
    <div className="flex h-full min-h-0">
      <section className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center gap-x-3 border-b border-border bg-card px-5 py-4 sm:px-6 group/header">
          <div className="min-w-0">
            <p className="font-mono text-[10px] font-medium uppercase tracking-[0.14em] text-foreground-muted">
              Analyze
            </p>
            <h1 className="mt-1 max-w-lg truncate text-base font-semibold tracking-[-0.025em]">
              {thread?.title ?? 'New analysis'}
            </h1>
            {catalog.data ? (
              <p className="mt-1 truncate text-xs text-foreground-muted">
                {catalog.data.sources.filter((source) => source.status === 'ready').map((source) => source.name).join(' · ') || 'No queryable data sources'}
              </p>
            ) : null}
          </div>
          {thread && (
            <IconButton
              intent="ghost"
              size="sm"
              aria-label="Rename Chat"
              className="opacity-0 group-hover/header:opacity-100 transition-opacity"
              onClick={() => setIsRenameModalOpen(true)}
            >
              <Icon name="edit" size="xs" />
            </IconButton>
          )}
        </header>

        <Modal open={isRenameModalOpen} onOpenChange={setIsRenameModalOpen}>
          <Modal.Content>
            <Modal.Header>
              <Modal.Title>Rename Chat</Modal.Title>
              <Modal.Description>Enter a new title for this chat.</Modal.Description>
              <Modal.Close />
            </Modal.Header>
            <Modal.Body>
              <Input
                autoFocus
                defaultValue={thread?.title}
                placeholder="e.g. Sales analysis"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    if (e.currentTarget.value.trim() && e.currentTarget.value.trim() !== thread?.title) {
                      renameMutation.mutate(e.currentTarget.value.trim());
                    } else {
                      setIsRenameModalOpen(false);
                    }
                  }
                }}
              />
            </Modal.Body>
          </Modal.Content>
        </Modal>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {workflowExecution.data ? (
            <div className="mx-auto mt-3 flex max-w-3xl items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-xs text-foreground-muted">
              <span className="font-medium text-foreground">{workflowExecution.data.selection_mode === 'auto' ? 'Auto chose' : 'Workflow run'} {workflowExecution.data.workflow_name} · v{workflowExecution.data.workflow_version}</span>
              <span>{workflowExecution.data.status}</span>
              <span className="truncate">{(workflowExecution.data.nodes ?? []).join(' → ')}</span>
              {workflowExecution.data.selection_reason ? <span className="truncate">{workflowExecution.data.selection_reason}</span> : null}
            </div>
          ) : null}
          <ChatContextProvider
            value={{
              getToken,
              onFollowUp: submit,
              onFillComposer: setDraft,
              activityByRun,
              agents: agents.data ?? [],
            }}
          >
            <AssistantRuntimeProvider runtime={runtime}>
              <ThreadPrimitive.Root>
                <ThreadPrimitive.Empty>
                  <ChatEmptyState
                    greetingName={identity.email.split('@')[0]}
                    suggestions={suggestionsFromCatalog(catalog.data ?? null)}
                    sourceName={sourceName}
                    onChoose={setDraft}
                  />
                </ThreadPrimitive.Empty>

                <ThreadPrimitive.If empty={false}>
                  <ThreadPrimitive.Viewport className="mx-auto flex max-w-3xl flex-col gap-8 px-5 py-8 sm:px-6">
                    <ThreadPrimitive.Messages components={{ UserMessage, AssistantMessage }} />

                    <div ref={endOfThread} />
                  </ThreadPrimitive.Viewport>
                </ThreadPrimitive.If>
              </ThreadPrimitive.Root>
            </AssistantRuntimeProvider>
            {send.isPending && !send.streaming ? (
              <div className="mx-auto w-full max-w-3xl px-5 py-4 sm:px-6">
                <ChatThinkingIndicator />
              </div>
            ) : null}
            {send.error ? (
              <p className="mx-auto w-full max-w-3xl px-5 pb-4 text-sm text-danger sm:px-6" role="alert">
                {send.error.message}
              </p>
            ) : null}
          </ChatContextProvider>
        </div>

          <ChatComposer
          draft={draft}
          onDraftChange={setDraft}
          onSend={submit}
          disabled={send.isPending || !canSend}
          workflowId={workflowId}
            onWorkflowChange={(nextWorkflowId) => {
              setWorkflowId(nextWorkflowId);
              setWorkflowVersion(
                workflows.data?.find((workflow) => workflow.workflow_id === nextWorkflowId)
                  ?.published_version ?? null,
              );
            }}
          workflows={workflows.data}
        />
      </section>
    </div>
  );
};
