import { useState } from 'react';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';

import { Alert, Badge, Skeleton } from '@open-zentra/foundation-design-system';

import type { TokenSource } from '../../api';
import type { IdentityContext } from '../../types';
import { useThreadEvents } from '../chat/use-thread-events';
import { getSequence } from './api';
import type { SequenceFlowNode } from './graph-layout';
import { NodeInspector } from './node-inspector';
import { SequenceCanvas } from './sequence-canvas';
import { SequenceChatPanel } from './sequence-chat-panel';

interface SequenceDetailPageProps {
  readonly getToken: TokenSource;
  readonly identity: IdentityContext;
}

/**
 * One Sequence: its chat, side by side with the graph that chat is building.
 *
 * Owns the single `useThreadEvents` subscription for this Sequence's thread —
 * `SequenceChatPanel` renders the feed it is handed rather than opening a
 * second connection. Any event for the thread invalidates the graph query, so
 * a new Sequence Step appearing from a chat turn renders without a manual
 * refresh; the server's version of the Sequence is what counts, so this
 * refetches rather than patches, the same discipline `chat-page.tsx` follows
 * for Threads.
 */
export const SequenceDetailPage = ({ getToken }: SequenceDetailPageProps) => {
  const { sequenceId } = useParams();
  const queryClient = useQueryClient();
  const [selectedNode, setSelectedNode] = useState<SequenceFlowNode | null>(null);

  const sequence = useQuery({
    queryKey: ['sequence', sequenceId],
    queryFn: () => getSequence(getToken, sequenceId as string),
    enabled: Boolean(sequenceId),
  });

  const threadId = sequence.data?.thread_id ?? null;

  const feed = useThreadEvents(getToken, threadId, 0, () => {
    void queryClient.invalidateQueries({ queryKey: ['sequence', sequenceId] });
    if (threadId) {
      void queryClient.invalidateQueries({ queryKey: ['thread', threadId] });
    }
  });

  if (sequence.isPending) {
    return (
      <div className="flex h-full flex-col gap-3 p-8">
        <Skeleton className="h-6 w-64" />
        <Skeleton className="h-[400px] w-full" />
      </div>
    );
  }

  if (sequence.error || !sequence.data) {
    return (
      <div className="p-8">
        <Alert intent="error" role="alert" title="This Sequence could not be loaded">
          {sequence.error?.message ?? 'Unknown error.'}
        </Alert>
        <Link to="/sequences" className="mt-4 inline-block text-sm text-primary underline">
          Back to Sequences
        </Link>
      </div>
    );
  }

  const graph = sequence.data;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex flex-wrap items-center gap-3 border-b border-border px-6 py-4">
        <h1 className="font-serif text-2xl font-normal tracking-[-0.03em]">
          {graph.raw_table.label}
        </h1>
        <Badge intent={graph.origin === 'manual' ? 'default' : 'secondary'} size="sm">
          {graph.origin === 'manual' ? 'Started here' : 'Started from chat'}
        </Badge>
      </header>

      <div className="flex min-h-0 flex-1">
        {threadId ? (
          <SequenceChatPanel getToken={getToken} threadId={threadId} feed={feed} />
        ) : (
          <section className="flex w-96 shrink-0 items-center justify-center border-r border-border p-6">
            <p className="text-center text-sm text-foreground-muted">
              This Sequence has no chat yet.
            </p>
          </section>
        )}

        <div className="min-h-0 flex-1">
          <SequenceCanvas graph={graph} onNodeClick={setSelectedNode} />
        </div>
      </div>

      <NodeInspector
        node={selectedNode}
        sequenceId={graph.sequence_id}
        getToken={getToken}
        onClose={() => setSelectedNode(null)}
      />
    </div>
  );
};
