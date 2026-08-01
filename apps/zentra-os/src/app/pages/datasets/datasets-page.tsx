import { useState } from 'react';

import { Alert, Button, EmptyState, Skeleton } from '@open-zentra/foundation-design-system';
import { Icon } from '@open-zentra/foundation-icons';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';

import type { TokenSource } from '../../api';
import type { IdentityContext } from '../../types';
import { listSources } from '../connections/api';

import { SourceCatalog } from './source-catalog';
import { TableDetailModal } from './table-detail-modal';
import type { CatalogTable } from './types';

interface DatasetsPageProps {
  readonly getToken: TokenSource;
  readonly identity: IdentityContext;
}

/**
 * What ZentraOS can actually read, per connected source.
 *
 * Built on Connections rather than beside them: a dataset here is always some
 * table in a source someone registered, so the page has nothing to show until
 * one exists and says so rather than rendering an empty shell.
 */
export const DatasetsPage = ({ getToken, identity }: DatasetsPageProps) => {
  const [openTable, setOpenTable] = useState<CatalogTable | null>(null);
  const canWrite = identity.role !== 'viewer';

  const sources = useQuery({
    queryKey: ['connector-sources'],
    queryFn: () => listSources(getToken),
  });

  const connected = (sources.data ?? []).filter(
    (source) => source.kind === 'connected',
  );

  return (
    <section className="px-8 py-10">
      <p className="font-mono text-[10px] font-bold uppercase tracking-[0.16em] text-primary">
        Catalog
      </p>
      <h1 className="mt-3 font-serif text-[clamp(2rem,4vw,3rem)] font-normal tracking-[-0.035em]">
        Datasets
      </h1>
      <p className="mt-3 max-w-2xl text-sm text-foreground-muted">
        The tables each connected source exposes, as the last harvest found them. Open one
        to see its columns, their declared types and what profiling observed.
      </p>

      {sources.isPending ? (
        <div className="mt-10 flex flex-col gap-3">
          <Skeleton className="h-6 w-64" />
          <Skeleton className="h-[92px] w-full" />
        </div>
      ) : null}

      {sources.error ? (
        <Alert
          intent="error"
          className="mt-10"
          role="alert"
          title="Sources could not be listed"
        >
          {sources.error.message}
        </Alert>
      ) : null}

      {sources.data && connected.length === 0 ? (
        <EmptyState
          className="mt-12 border border-border bg-card"
          size="lg"
          icon={<Icon name="database" size="xl" />}
        >
          <EmptyState.Title>No datasets yet</EmptyState.Title>
          <EmptyState.Description>
            Datasets come from harvesting a connected source. Connect a ClickHouse service
            and this page fills with its tables.
          </EmptyState.Description>
          <EmptyState.Actions>
            <Button component={Link} to="/connections/new/clickhouse" disabled={!canWrite}>
              Connect ClickHouse
            </Button>
            <Button component={Link} to="/connections" intent="secondary">
              View connections
            </Button>
          </EmptyState.Actions>
        </EmptyState>
      ) : null}

      <div className="mt-10">
        {connected.map((source) => (
          <SourceCatalog
            key={source.data_source_id}
            source={source}
            getToken={getToken}
            canWrite={canWrite}
            onOpenTable={setOpenTable}
          />
        ))}
      </div>

      <TableDetailModal table={openTable} onClose={() => setOpenTable(null)} />
    </section>
  );
};
