import { useState } from 'react';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';

import { Alert, Button, EmptyState, Skeleton } from '@open-zentra/foundation-design-system';
import { Icon } from '@open-zentra/foundation-icons';

import type { TokenSource } from '../../api';
import type { IdentityContext } from '../../types';
import { listSources } from '../connections/api';
import { setFieldAgentAccess } from './api';
import { SourceCatalog } from './source-catalog';
import { TableDetailModal } from './table-detail-modal';
import type { CatalogResponse, CatalogTable } from './types';

interface DatasetsPageProps {
  readonly getToken: TokenSource;
  readonly identity: IdentityContext;
}

interface OpenTable {
  readonly table: CatalogTable;
  readonly dataSourceId: string;
}

const UploadedSource = ({ source }: { readonly source: { readonly data_source_id: string; readonly name: string } }) => (
  <article className="flex flex-wrap items-center gap-4 rounded-xl border border-border bg-card p-5 shadow-[var(--shadow-depth-01)]">
    <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary" aria-hidden="true">
      <Icon name="upload" size="sm" />
    </span>
    <div className="min-w-0 flex-1">
      <p className="font-medium">{source.name}</p>
      <p className="mt-1 text-sm text-foreground-muted">Uploaded data · private to you until shared</p>
    </div>
    <Button component={Link} to={`/chats?source=${encodeURIComponent(source.data_source_id)}&sourceName=${encodeURIComponent(source.name)}`} size="sm">
      Analyze
    </Button>
  </article>
);

/**
 * What Nexus can actually read, per connected source.
 *
 * Built on Connections rather than beside them: a dataset here is always some
 * table in a source someone registered, so the page has nothing to show until
 * one exists and says so rather than rendering an empty shell.
 */
export const DatasetsPage = ({ getToken, identity }: DatasetsPageProps) => {
  const [openTable, setOpenTable] = useState<OpenTable | null>(null);
  const canWrite = identity.role !== 'viewer';
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const sources = useQuery({
    queryKey: ['connector-sources'],
    queryFn: () => listSources(getToken),
  });

  const toggleFieldAccess = useMutation({
    mutationFn: (input: {
      dataSourceId: string;
      tableName: string;
      fieldName: string;
      visible: boolean;
    }) =>
      setFieldAgentAccess(
        getToken,
        input.dataSourceId,
        input.tableName,
        input.fieldName,
        input.visible,
      ),
    onMutate: async (input) => {
      const queryKey = ['catalog', input.dataSourceId];
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueryData<CatalogResponse>(queryKey);
      queryClient.setQueryData<CatalogResponse>(queryKey, (current) =>
        current
          ? {
              ...current,
              tables: current.tables?.map((table) =>
                table.name === input.tableName
                  ? {
                      ...table,
                      fields: table.fields?.map((field) =>
                        field.name === input.fieldName
                          ? { ...field, agent_visible: input.visible }
                          : field,
                      ),
                    }
                  : table,
              ),
            }
          : current,
      );
      setOpenTable((current) =>
        current && current.table.name === input.tableName
          ? {
              ...current,
              table: {
                ...current.table,
                fields: current.table.fields?.map((field) =>
                  field.name === input.fieldName
                    ? { ...field, agent_visible: input.visible }
                    : field,
                ),
              },
            }
          : current,
      );
      return { previous, queryKey };
    },
    onError: (_error, _input, context) => {
      if (context?.previous) queryClient.setQueryData(context.queryKey, context.previous);
    },
    onSettled: (_data, _error, input) => {
      void queryClient.invalidateQueries({ queryKey: ['catalog', input.dataSourceId] });
    },
  });

  const connected = (sources.data ?? []).filter((source) => source.kind === 'connected');
  const uploaded = (sources.data ?? []).filter((source) => source.kind === 'uploaded');

  return (
    <section className="px-5 py-8 sm:px-8 sm:py-10">
      <div className="flex flex-wrap items-end justify-between gap-5 border-b border-border pb-7">
        <div>
          <p className="font-mono text-[10px] font-medium uppercase tracking-[0.16em] text-primary">
            Data
          </p>
          <h1 className="mt-3 text-[clamp(2rem,4vw,3rem)] font-semibold tracking-[-0.045em]">
            Your data
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-foreground-muted">
            Review the sources available to this workspace and the tables Nexus can use when
            answering your questions.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button component={Link} to="/sequences" intent="secondary">
            <Icon name="columns" size="sm" /> Open workflows
          </Button>
          <Button component={Link} to="/connections/new/upload" disabled={!canWrite}>
            <Icon name="upload" size="sm" /> Upload file
          </Button>
        </div>
      </div>

      {sources.isPending ? (
        <div className="mt-10 flex flex-col gap-3">
          <Skeleton className="h-6 w-64" />
          <Skeleton className="h-[92px] w-full" />
        </div>
      ) : null}

      {sources.error ? (
        <Alert intent="error" className="mt-10" role="alert" title="Sources could not be listed">
          {sources.error.message}
        </Alert>
      ) : null}

      {sources.data && sources.data.length === 0 ? (
        <EmptyState
          className="mt-10 border-0 bg-transparent shadow-none"
          size="lg"
          icon={<Icon name="database" size="xl" />}
        >
          <EmptyState.Title>No datasets yet</EmptyState.Title>
          <EmptyState.Description>
            Upload a file to begin immediately, or connect a warehouse when your data already
            lives elsewhere.
          </EmptyState.Description>
          <EmptyState.Actions>
            <Button component={Link} to="/connections/new/upload" disabled={!canWrite}>
              Upload a file
            </Button>
            <Button component={Link} to="/connections/new/clickhouse" intent="secondary" disabled={!canWrite}>
              Connect a warehouse
            </Button>
          </EmptyState.Actions>
        </EmptyState>
      ) : null}

      {uploaded.length > 0 ? (
        <section className="mt-9">
          <h2 className="font-mono text-[10px] font-medium uppercase tracking-[0.16em] text-foreground-muted">Uploads</h2>
          <div className="mt-3 flex flex-col gap-3">
            {uploaded.map((source) => <UploadedSource key={source.data_source_id} source={source} />)}
          </div>
        </section>
      ) : null}

      <div className="mt-10">
        {connected.map((source) => (
          <SourceCatalog
            key={source.data_source_id}
            source={source}
            getToken={getToken}
            canWrite={canWrite}
            onOpenTable={(table) => setOpenTable({ table, dataSourceId: source.data_source_id })}
            onBrowseRows={(table) =>
              navigate(
                `/datasets/${source.data_source_id}/tables/${encodeURIComponent(table.name)}/rows`,
              )
            }
          />
        ))}
      </div>

      <TableDetailModal
        table={openTable?.table ?? null}
        canWrite={canWrite}
        onClose={() => setOpenTable(null)}
        onToggleField={(fieldName, visible) => {
          if (!openTable) return;
          toggleFieldAccess.mutate({
            dataSourceId: openTable.dataSourceId,
            tableName: openTable.table.name,
            fieldName,
            visible,
          });
        }}
      />
    </section>
  );
};
