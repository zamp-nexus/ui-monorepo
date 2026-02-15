import React, { type PropsWithChildren } from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { FunctionReference } from 'convex/server';
import type { DataLayerInternals } from '../provider/data-layer-internals-context';
import { DataLayerInternalsContext } from '../provider/data-layer-internals-context';
import { useDLCreate } from './use-dl-create';

const convexMutationMock = vi.fn();

vi.mock('@convex-dev/react-query', () => ({
  useConvexMutation: () => convexMutationMock,
}));

const createInternals = (): DataLayerInternals => {
  const queryClient = new QueryClient();
  const queueManager = {
    enqueue: vi.fn().mockResolvedValue(undefined),
  };

  const base = {
    queryClient,
    convexClient: {},
    convexQueryClient: {},
    database: {
      queries: {
        set: vi.fn().mockResolvedValue(undefined),
        delete: vi.fn().mockResolvedValue(undefined),
      },
    },
    syncCoordinator: {
      getQueueManager: vi.fn(() => queueManager),
    },
    duckdbRouter: null,
    opfsManager: null,
    analyticsEnabled: true,
    initializeAnalytics: vi.fn().mockResolvedValue(null),
    isOnline: false,
    cacheConfig: {
      defaultStaleTime: 60_000,
      defaultGcTime: 300_000,
      analyticsStaleTime: 60_000,
      analyticsGcTime: 300_000,
    },
    tableRegistry: {},
    datasourceApi: null,
    getTableSyncService: vi.fn(),
    getFileDownloadService: vi.fn().mockResolvedValue(null),
  } satisfies Record<string, unknown>;

  return base as unknown as DataLayerInternals;
};

const createWrapper = (internals: DataLayerInternals) => {
  const Wrapper = ({ children }: PropsWithChildren): React.ReactElement => (
    <QueryClientProvider client={internals.queryClient}>
      <DataLayerInternalsContext.Provider value={internals}>
        {children}
      </DataLayerInternalsContext.Provider>
    </QueryClientProvider>
  );
  return Wrapper;
};

describe('useDLCreate', () => {
  beforeEach(() => {
    convexMutationMock.mockReset();
  });

  it('queues create mutation and returns optimistic data when offline', async () => {
    const internals = createInternals();
    const queueManager = internals.syncCoordinator.getQueueManager();
    convexMutationMock.mockResolvedValue({ id: 'server_1' });

    internals.queryClient.setQueryData(['events'], []);

    const { result } = renderHook(
      () =>
        useDLCreate({
          mutation: {} as FunctionReference<'mutation'>,
          table: 'events',
          listQueryKey: ['events'],
          onOptimistic: (variables: { name: string }) => ({ name: variables.name }),
        }),
      { wrapper: createWrapper(internals) }
    );

    let response: { id: string; name: string } | undefined;
    await act(async () => {
      response = await result.current.mutateAsync({ name: 'offline-event' });
    });

    await waitFor(() => expect(queueManager.enqueue).toHaveBeenCalledTimes(1));
    expect(convexMutationMock).not.toHaveBeenCalled();
    expect(response?.name).toBe('offline-event');
    expect(response?.id).toBeDefined();
    expect(result.current.isQueued).toBe(true);
  });
});
