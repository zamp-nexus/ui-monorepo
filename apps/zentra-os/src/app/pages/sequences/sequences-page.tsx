import { useState } from 'react';

import { Alert, Button, EmptyState, Skeleton } from '@open-zentra/foundation-design-system';
import { Icon } from '@open-zentra/foundation-icons';
import { useQuery } from '@tanstack/react-query';

import type { TokenSource } from '../../api';
import type { IdentityContext } from '../../types';

import { listSequences } from './api';
import { NewSequenceModal } from './new-sequence-modal';
import { SequenceCard } from './sequence-card';

interface SequencesPageProps {
  readonly getToken: TokenSource;
  readonly identity: IdentityContext;
}

/**
 * The Dataset Workspace's Sequences — every multi-step cleaning pipeline
 * built, whether started here or (once Phase 5 exists) from a chat.
 *
 * One Dataset Workspace per Tenant (see `dataset_workspace_id_for` on the
 * API side), so the tenant name in the header is the only "which workspace"
 * signal this page needs.
 */
export const SequencesPage = ({ getToken, identity }: SequencesPageProps) => {
  const [creating, setCreating] = useState(false);
  const canWrite = identity.role !== 'viewer';

  const sequences = useQuery({
    queryKey: ['sequences'],
    queryFn: () => listSequences(getToken),
  });

  const items = sequences.data?.items ?? [];

  return (
    <section className="px-8 py-10">
      <p className="font-mono text-[10px] font-bold uppercase tracking-[0.16em] text-primary">
        {identity.tenant_name}
      </p>
      <div className="mt-3 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-serif text-[clamp(2rem,4vw,3rem)] font-normal tracking-[-0.035em]">
            Sequences
          </h1>
          <p className="mt-3 max-w-2xl text-sm text-foreground-muted">
            Multi-step cleaning pipelines from a Raw Table to one or more Final
            Tables, built by chatting with Data Steward.
          </p>
        </div>
        <Button disabled={!canWrite} onClick={() => setCreating(true)}>
          New Sequence
        </Button>
      </div>

      {sequences.isPending ? (
        <div className="mt-10 flex flex-col gap-3">
          <Skeleton className="h-6 w-64" />
          <Skeleton className="h-[92px] w-full" />
        </div>
      ) : null}

      {sequences.error ? (
        <Alert
          intent="error"
          className="mt-10"
          role="alert"
          title="Sequences could not be listed"
        >
          {sequences.error.message}
        </Alert>
      ) : null}

      {sequences.data && items.length === 0 ? (
        <EmptyState
          className="mt-12 border border-border bg-card"
          size="lg"
          icon={<Icon name="columns" size="xl" />}
        >
          <EmptyState.Title>No Sequences yet</EmptyState.Title>
          <EmptyState.Description>
            Start one from a Raw Table and Data Steward will build it out as
            you chat.
          </EmptyState.Description>
          <EmptyState.Actions>
            <Button disabled={!canWrite} onClick={() => setCreating(true)}>
              New Sequence
            </Button>
          </EmptyState.Actions>
        </EmptyState>
      ) : null}

      <div className="mt-10 flex flex-col gap-3">
        {items.map((sequence) => (
          <SequenceCard key={sequence.sequence_id} sequence={sequence} />
        ))}
      </div>

      <NewSequenceModal
        open={creating}
        getToken={getToken}
        onClose={() => setCreating(false)}
      />
    </section>
  );
};
