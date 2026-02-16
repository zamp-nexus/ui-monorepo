import React, { type PropsWithChildren } from 'react';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { FunctionReference } from 'convex/server';

import { DATA_SOURCE } from '@open-insights-web/foundation-data-model';

import type { DataLayerInternals } from '../provider/data-layer-internals-context';
import { DataLayerInternalsContext } from '../provider/data-layer-internals-context';
import { useDLGet } from './use-dl-get';

const createInternals = (overrides: Partial<DataLayerInternals> = {}): DataLayerInternals => {
  const queryClient = overrides.queryClient ?? new QueryClient();
  const defaultInternals = {
    queryClient,
    convexClient: {
      query: vi.fn(),
    },
    convexQueryClient: {},
    database: {
      queries: {
        get: vi.fn().mockResolvedValue(undefined),
        set: vi.fn().mockResolvedValue(undefined),
        delete: vi.fn().mockResolvedValue(undefined),
      },
    },
    syncCoordinator: {
      getQueueManager: vi.fn(),
    },
    duckdbRouter: null,
    opfsManager: null,
    analyticsEnabled: true,
    initializeAnalytics: vi.fn().mockResolvedValue(null),
    isOnline: true,
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

  return {
    ...(defaultInternals as unknown as DataLayerInternals),
    ...overrides,
    queryClient,
  };
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

describe('useDLGet', () => {
  it('loads data from convex when online', async () => {
    const convexResult = { id: 'evt_1', type: 'click' };
    const convexQuery = vi.fn().mockResolvedValue(convexResult);
    const internals = createInternals({
      isOnline: true,
      convexClient: { query: convexQuery } as unknown as DataLayerInternals['convexClient'],
    });

    const queryRef = {} as FunctionReference<'query'>;
    const { result } = renderHook(
      () => useDLGet({ query: queryRef, table: 'events', args: { id: 'evt_1' } }),
      { wrapper: createWrapper(internals) },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(convexQuery).toHaveBeenCalledTimes(1);
    expect(result.current.data).toEqual(convexResult);
    expect(result.current.dataSource).toBe(DATA_SOURCE.CONVEX);
  });

  it('falls back to cache when offline', async () => {
    const cachedResult = { id: 'evt_cached', type: 'view' };
    const queries = {
      get: vi.fn().mockResolvedValue({ data: cachedResult }),
      set: vi.fn().mockResolvedValue(undefined),
      delete: vi.fn().mockResolvedValue(undefined),
    };
    const internals = createInternals({
      isOnline: false,
      database: { queries } as unknown as DataLayerInternals['database'],
    });

    const queryRef = {} as FunctionReference<'query'>;
    const { result } = renderHook(
      () => useDLGet({ query: queryRef, table: 'events', args: { id: 'evt_cached' } }),
      { wrapper: createWrapper(internals) },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(queries.get).toHaveBeenCalledTimes(1);
    expect(result.current.data).toEqual(cachedResult);
    expect(result.current.dataSource).toBe(DATA_SOURCE.CACHE);
  });
});
