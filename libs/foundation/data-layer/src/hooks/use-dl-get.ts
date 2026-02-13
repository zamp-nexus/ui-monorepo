/**
 * useDLGet - Query hook with Convex real-time + offline cache fallback
 *
 * Uses TanStack Query with Convex live subscriptions for real-time updates.
 * Falls back to DatabaseFacade cache (foundation-database) when offline.
 *
 * @module hooks/use-dl-get
 */

import { useEffect, useMemo, useCallback, useRef } from 'react';
import { useQuery, type UseQueryOptions, type UseQueryResult, type QueryKey } from '@tanstack/react-query';
import { convexQuery } from '@convex-dev/react-query';
import type { FunctionReference, FunctionArgs, FunctionReturnType } from 'convex/server';
import { hashQueryKey, SCHEMA_VERSION, toJsonSerializable } from '@open-insights-web/foundation-data-model';
import { createCacheEntry } from '@open-insights-web/foundation-database';
import { useDataLayerInternals } from '../provider/data-layer-internals-context';
import { buildQueryKey, getDataSource } from '../utils/query-key';
import { createScopedErrorHandler } from '../utils/error-handler';

// =============================================================================
// Types
// =============================================================================

/**
 * Options for useDLGet hook
 */
export interface UseDLGetOptions<
  TQuery extends FunctionReference<'query'>,
  TData = FunctionReturnType<TQuery>,
> {
  /** Convex query function reference */
  readonly query: TQuery;
  /** Query arguments */
  readonly args?: FunctionArgs<TQuery>;
  /** Table name for caching */
  readonly table: string;
  /** Entity ID for single-item queries */
  readonly entityId?: string;
  /** Whether the query is enabled */
  readonly enabled?: boolean;
  /** Stale time in milliseconds */
  readonly staleTime?: number;
  /** Garbage collection time in milliseconds */
  readonly gcTime?: number;
  /** Custom query key (auto-generated if not provided) */
  readonly queryKey?: QueryKey;
  /** Transform the data */
  readonly select?: (data: FunctionReturnType<TQuery>) => TData;
  /** Placeholder data while loading */
  readonly placeholderData?: TData | (() => TData);
}

/**
 * Result from useDLGet hook
 */
export interface DLGetResult<TData> extends Omit<UseQueryResult<TData, Error>, 'data'> {
  /** The query data */
  readonly data: TData | undefined;
  /** Whether data is from offline cache */
  readonly isOffline: boolean;
  /** Source of the current data */
  readonly dataSource: 'convex' | 'cache' | 'none';
  /** Last sync timestamp */
  readonly lastSyncedAt: number | null;
}

// Create scoped error handler for this hook
const handleGetError = createScopedErrorHandler('useDLGet');

/**
 * Query options type for online mode (Convex-backed)
 */
type OnlineQueryOptions<TData, TSelect = TData> = UseQueryOptions<TData, Error, TSelect> & {
  queryKey: QueryKey;
};

/**
 * Query options type for offline mode (cache-backed)
 */
type OfflineQueryOptions<TData, TSelect = TData> = UseQueryOptions<TData, Error, TSelect> & {
  queryKey: QueryKey;
  queryFn: () => Promise<TData>;
};

/**
 * Query hook with Convex real-time subscriptions and offline cache support
 *
 * Uses foundation-database's DatabaseFacade for offline persistence.
 *
 * @example
 * ```tsx
 * const { data, isLoading, isOffline } = useDLGet({
 *   query: api.users.get,
 *   args: { id: userId },
 *   table: 'users',
 *   entityId: userId,
 * });
 * ```
 */
export const useDLGet = <
  TQuery extends FunctionReference<'query'>,
  TData = FunctionReturnType<TQuery>,
>(options: UseDLGetOptions<TQuery, TData>): DLGetResult<TData> => {
  const { database, isOnline, cacheConfig } = useDataLayerInternals();

  const {
    query,
    args,
    table,
    entityId,
    enabled = true,
    staleTime,
    gcTime,
    queryKey: customQueryKey,
    select,
  } = options;

  type QueryData = FunctionReturnType<TQuery>;

  // Build query key - memoized
  const queryKey = useMemo(
    () => customQueryKey ?? buildQueryKey(table, entityId, args),
    [customQueryKey, table, entityId, args]
  );

  // Use refs for values needed in persist effect but shouldn't trigger re-runs
  // This optimizes the effect by reducing unnecessary dependency changes
  const databaseRef = useRef(database);
  databaseRef.current = database;
  
  const tableRef = useRef(table);
  tableRef.current = table;
  
  const cacheConfigRef = useRef(cacheConfig);
  cacheConfigRef.current = cacheConfig;

  // Get Convex query options (provides live WebSocket subscription when online)
  // Note: Convex functions may have optional or no args, so we need a safe default
  const convexArgs = (args ?? {}) as FunctionArgs<TQuery>;
  const convexOptions = convexQuery(query, convexArgs);

  // Offline query function - reads from DatabaseFacade cache
  // Uses ref for database to maintain stable callback
  const offlineQueryFn = useCallback(async (): Promise<QueryData> => {
    const qHash = hashQueryKey(queryKey);
    const cached = await databaseRef.current.queries.get(qHash);

    if (cached?.data !== undefined) {
      return cached.data as QueryData;
    }

    throw new Error('No cached data available while offline');
  }, [queryKey]);

  // Build query options based on online/offline status
  const queryOptions: OnlineQueryOptions<QueryData, TData> | OfflineQueryOptions<QueryData, TData> = isOnline
    ? {
        ...convexOptions,
        queryKey,
        enabled,
        staleTime: staleTime ?? cacheConfig.defaultStaleTime,
        gcTime: gcTime ?? cacheConfig.defaultGcTime,
        select,
      } as OnlineQueryOptions<QueryData, TData>
    : {
        queryKey,
        queryFn: offlineQueryFn,
        enabled,
        staleTime: staleTime ?? cacheConfig.defaultStaleTime,
        gcTime: gcTime ?? cacheConfig.defaultGcTime,
        select,
      } as OfflineQueryOptions<QueryData, TData>;

  const result = useQuery<QueryData, Error, TData>(queryOptions);

  // Persist successful results to DatabaseFacade for offline access
  // Optimized: Uses refs for database, table, and cacheConfig to minimize effect re-runs
  // Effect only re-runs when: data changes, success state changes, online state changes, or queryKey changes
  useEffect(() => {
    // Early return if nothing to persist
    if (result.data === undefined || !result.isSuccess || !isOnline) {
      return;
    }

    // Access current values via refs to avoid stale closures
    const currentDatabase = databaseRef.current;
    const currentTable = tableRef.current;
    const currentCacheConfig = cacheConfigRef.current;

    const qHash = hashQueryKey(queryKey);
    const serializedData = toJsonSerializable(result.data);
    const entry = createCacheEntry(
      qHash,
      queryKey,
      serializedData,
      {
        tableName: currentTable,
        ttl: currentCacheConfig.defaultGcTime,
        schemaVersion: SCHEMA_VERSION,
        isOfflineData: false,
      }
    );

    // Fire and forget - persist to cache
    currentDatabase.queries.set(entry).catch((err) => {
      handleGetError(err, { data: { queryKey, table: currentTable } });
    });
  }, [result.data, result.isSuccess, isOnline, queryKey]);
  // Note: database, table, cacheConfig accessed via refs - not in deps

  // Compute derived state - memoized
  const dataSource = useMemo(
    () => getDataSource(result.data !== undefined, isOnline, result.isFetching),
    [result.data, isOnline, result.isFetching]
  );

  return {
    ...result,
    // result.data is already TData | undefined from useQuery<QueryData, Error, TData>
    data: result.data,
    isOffline: !isOnline,
    dataSource,
    lastSyncedAt: result.dataUpdatedAt ?? null,
  };
}

/**
 * Simplified hook for list queries (no entityId needed)
 *
 * @example
 * ```tsx
 * const { data: users } = useDLGetList({
 *   query: api.users.list,
 *   args: { limit: 10 },
 *   table: 'users',
 * });
 * ```
 */
export const useDLGetList = <
  TQuery extends FunctionReference<'query'>,
  TData = FunctionReturnType<TQuery>,
>(options: Omit<UseDLGetOptions<TQuery, TData>, 'entityId'>): DLGetResult<TData> =>
  useDLGet(options);

/**
 * Simplified hook for single item queries (entityId required)
 *
 * @example
 * ```tsx
 * const { data: user } = useDLGetOne({
 *   query: api.users.get,
 *   args: { id: userId },
 *   table: 'users',
 *   entityId: userId,
 * });
 * ```
 */
export const useDLGetOne = <
  TQuery extends FunctionReference<'query'>,
  TData = FunctionReturnType<TQuery>,
>(options: UseDLGetOptions<TQuery, TData> & { entityId: string }): DLGetResult<TData> =>
  useDLGet(options);
