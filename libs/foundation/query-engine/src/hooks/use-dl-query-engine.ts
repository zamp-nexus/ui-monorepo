/**
 * useDLQueryEngine - Unified Query Hook
 *
 * Main query hook that routes between analytics (DuckDB) and transactional (Convex)
 * paths based on query structure. Uses Data Layer hooks for actual execution.
 *
 * Features:
 * - Automatic routing via Decision Engine
 * - SQL compilation for analytics queries
 * - Unified result type with discriminated unions
 * - Uses singleton engine components for better memory efficiency
 * - Background file sync for analytics tables (stale-while-revalidate)
 *
 * NOTE: This hook delegates ALL execution to foundation-data-layer.
 * It does NOT directly access DuckDB or Convex.
 *
 * @module hooks/use-dl-query-engine
 */

import { useMemo, useCallback } from 'react';
import {
  useDataLayerInternals,
  useDLGetList,
  useDLAnalytics,
  createAnalyticsQueryKey,
  useBackgroundFileSync,
  DATA_FRESHNESS,
} from '@open-insights-web/foundation-data-layer';
import { hashPayloadSync } from '@open-insights-web/foundation-utils';

import { getDecisionEngine } from '../engine/decision-engine';
import { getSqlCompiler } from '../compiler/sql-compiler';
import { getTableExtractor } from '../engine/table-extractor';
import { convertFiltersToArgs } from '../engine/filter-converter';
import {
  DECISION_PATHS,
  type DecisionContext,
  type DecisionResult,
  type DecisionTableConfig,
} from '../types/decision';
import type { Query } from '../types/query';
import type { AnalyticsFreshness } from '../types/table';
import { EMPTY_ARRAY, EMPTY_OBJECT } from '@open-insights-web/foundation-utils';
import { OPERATIONS } from '../types/operations';
import { HOOK_PATH_TO_DECISION_PATH } from '../internal/constants';
import {
  type UseDLQueryEngineOptions,
  type UseDLQueryEngineResult,
  EXECUTION_PATHS,
  DATA_SOURCES,
} from './types';
import {
  getAnyQueryReference,
  getListQueryReference,
} from './internal/data-layer-adapters';

// =============================================================================
// HOOK IMPLEMENTATION
// =============================================================================

const mapAnalyticsFreshness = (
  freshness: string | undefined
): AnalyticsFreshness | undefined => {
  switch (freshness) {
    case DATA_FRESHNESS.REALTIME:
      return 'realtime';
    case DATA_FRESHNESS.NEAR_REALTIME:
      return 'near-realtime';
    case DATA_FRESHNESS.EVENTUAL:
      return 'eventual';
    default:
      return undefined;
  }
};

const selectQueryResultData = <TData,>(
  rawData: unknown,
  select?: (data: unknown) => TData
): TData => (select ? select(rawData) : (rawData as TData));

/**
 * useDLQueryEngine
 *
 * Unified query hook with intelligent routing between analytics (DuckDB)
 * and transactional (Convex) paths.
 *
 * Uses singleton engine components for better memory efficiency:
 * - TableExtractor: Shared singleton for extracting tables from queries
 * - SqlCompiler: Shared singleton with LRU cache for SQL compilation
 * - DecisionEngine: Shared singleton for routing decisions
 *
 * Delegates execution to data-layer hooks:
 * - useDLAnalytics: For DuckDB analytics queries
 * - useDLGetList: For Convex transactional queries
 *
 * @typeParam TQuery - Query type (inferred from query prop)
 * @typeParam TData - Result data type (inferred or specified via select)
 *
 * @example
 * ```tsx
 * // Analytics query (auto-routed to DuckDB)
 * const { data, sql, executionTimeMs } = useDLQueryEngine({
 *   query: {
 *     dimensions: [{ member: 'users.country' }],
 *     measures: [{ member: 'orders.amount', aggregation: 'sum' }],
 *   },
 * });
 *
 * // Transactional query (auto-routed to Convex)
 * const { data } = useDLQueryEngine({
 *   query: {
 *     dimensions: [{ member: 'users.name' }],
 *     filters: [{ member: 'users.status', operator: 'equals', values: ['active'] }],
 *   },
 * });
 * ```
 */
export const useDLQueryEngine = <TQuery extends Query, TData = unknown>(
  options: UseDLQueryEngineOptions<TQuery, TData>
): UseDLQueryEngineResult<TData> => {
  const {
    query,
    enabled = true,
    staleTime,
    gcTime,
    select,
    forcePath,
    preferAnalytics,
  } = options;

  // ─────────────────────────────────────────────────────────────────────────
  // DATA LAYER CONTEXT
  // ─────────────────────────────────────────────────────────────────────────

  const { isOnline, duckdbRouter, tableRegistry, queryClient, cacheConfig } =
    useDataLayerInternals();

  // ─────────────────────────────────────────────────────────────────────────
  // ENGINE COMPONENTS (Singletons)
  // ─────────────────────────────────────────────────────────────────────────

  // Use singleton engine components for better memory efficiency
  const tableExtractor = getTableExtractor();
  const sqlCompiler = getSqlCompiler();
  const decisionEngine = getDecisionEngine();

  // ─────────────────────────────────────────────────────────────────────────
  // TABLE EXTRACTION
  // ─────────────────────────────────────────────────────────────────────────

  const extraction = useMemo(
    () => tableExtractor.extractDetailed(query),
    [tableExtractor, query]
  );

  const tables = extraction.tables;
  const primaryTable = extraction.primaryTable;

  // ─────────────────────────────────────────────────────────────────────────
  // BUILD TABLE CONFIGS FOR DECISION
  // ─────────────────────────────────────────────────────────────────────────

  const tableConfigs = useMemo(() => {
    const configs = new Map<string, DecisionTableConfig>();
    for (const tableName of tables) {
      const config = tableRegistry.getTable(tableName);
      if (config) {
        const mappedFreshness = mapAnalyticsFreshness(config.analytics?.freshness);
        configs.set(tableName, {
          convex: config.convex,
          ...(mappedFreshness !== undefined
            ? { analytics: { freshness: mappedFreshness } }
            : {}),
        });
      }
    }
    return configs;
  }, [tables, tableRegistry]);

  // ─────────────────────────────────────────────────────────────────────────
  // ROUTING DECISION
  // ─────────────────────────────────────────────────────────────────────────

  const decision = useMemo((): DecisionResult | null => {
    if (!enabled || tables.length === 0) return null;

    const context: DecisionContext = {
      tables: [...tables],
      operation: query.operation ?? OPERATIONS.LIST,
      tableConfigs,
      isOnline,
      isDuckDBAvailable: duckdbRouter !== null,
    };

    return decisionEngine.decide(query, context, {
      forcePath: forcePath ? HOOK_PATH_TO_DECISION_PATH[forcePath] : undefined,
      preferAnalytics,
      includeFactors: false,
    });
  }, [
    enabled,
    query,
    tables,
    tableConfigs,
    isOnline,
    duckdbRouter,
    decisionEngine,
    forcePath,
    preferAnalytics,
  ]);

  const isAnalyticsPath = decision?.path === DECISION_PATHS.DUCKDB;
  const isTransactionalPath = decision?.path === DECISION_PATHS.API;

  // ─────────────────────────────────────────────────────────────────────────
  // BACKGROUND FILE SYNC (analytics path only)
  // ─────────────────────────────────────────────────────────────────────────

  // Use background file sync for analytics tables
  // This implements stale-while-revalidate: return cached data immediately
  // while downloading newer files in the background
  const backgroundSync = useBackgroundFileSync({
    tables: [...tables],
    enabled: isAnalyticsPath && enabled,
    onProgress: options.onDownloadProgress,
    onComplete: () => {
      // Invalidate analytics queries when new data is downloaded
      void queryClient.invalidateQueries({
        queryKey: ['analytics'],
        refetchType: 'active',
      });
    },
  });

  // Use background sync state for download progress
  const downloadState = backgroundSync.downloadProgress;

  // ─────────────────────────────────────────────────────────────────────────
  // QUERY KEY (using data-layer utility)
  // ─────────────────────────────────────────────────────────────────────────

  const queryKeyHash = useMemo(() => hashPayloadSync(query), [query]);

  // Use data-layer's createAnalyticsQueryKey for analytics path
  const analyticsQueryKey = useMemo(
    () => createAnalyticsQueryKey('query-engine', 'query', queryKeyHash),
    [queryKeyHash]
  );

  const transactionalQueryKey = useMemo(
    () => ['query-engine', 'transactional', primaryTable, queryKeyHash] as const,
    [primaryTable, queryKeyHash]
  );

  // ─────────────────────────────────────────────────────────────────────────
  // COMPILE SQL (Analytics only)
  // ─────────────────────────────────────────────────────────────────────────

  const { compiledSql, compilationError } = useMemo((): {
    compiledSql: string | null;
    compilationError: Error | null;
  } => {
    if (!isAnalyticsPath) return { compiledSql: null, compilationError: null };
    try {
      const result = sqlCompiler.compile(query);
      return { compiledSql: result.sql, compilationError: null };
    } catch (error) {
      return {
        compiledSql: null,
        compilationError: error instanceof Error ? error : new Error(String(error)),
      };
    }
  }, [isAnalyticsPath, query, sqlCompiler]);

  // ─────────────────────────────────────────────────────────────────────────
  // ANALYTICS PATH: useDLAnalytics (data-layer hook)
  // ─────────────────────────────────────────────────────────────────────────

  const analyticsEnabled =
    enabled && isAnalyticsPath && compiledSql !== null && !downloadState.isDownloading;

  const analyticsResult = useDLAnalytics({
    sql: compiledSql ?? '',
    params: EMPTY_ARRAY,
    queryKey: analyticsQueryKey,
    enabled: analyticsEnabled,
    staleTime: staleTime ?? cacheConfig.analyticsStaleTime,
    gcTime: gcTime ?? cacheConfig.analyticsGcTime,
  });

  // ─────────────────────────────────────────────────────────────────────────
  // TRANSACTIONAL PATH: useDLGetList (data-layer hook)
  // ─────────────────────────────────────────────────────────────────────────

  // Convert query filters to args using the new filter-converter
  const transactionalArgs = useMemo(() => {
    if (!isTransactionalPath || !primaryTable) return EMPTY_OBJECT;
    return convertFiltersToArgs(query);
  }, [isTransactionalPath, primaryTable, query]);

  // Get Convex query function reference from TableRegistry
  const fallbackQueryRef = useMemo(
    () => getAnyQueryReference(tableRegistry),
    [tableRegistry]
  );

  const listQueryRef = useMemo(() => {
    if (!primaryTable) {
      return undefined;
    }
    return getListQueryReference(tableRegistry, primaryTable);
  }, [primaryTable, tableRegistry]);

  const transactionalQueryRef = listQueryRef ?? fallbackQueryRef;

  const transactionalEnabled =
    enabled && isTransactionalPath && !!primaryTable && listQueryRef !== undefined;

  if (!transactionalQueryRef) {
    throw new Error(
      'useDLQueryEngine requires at least one query API reference in the table registry'
    );
  }

  const transactionalResult = useDLGetList({
    query: transactionalQueryRef,
    args: transactionalArgs,
    table: primaryTable ?? '',
    enabled: transactionalEnabled,
    staleTime: staleTime ?? (primaryTable ? tableRegistry.getStaleTime(primaryTable) : cacheConfig.defaultStaleTime),
    gcTime: gcTime ?? (primaryTable ? tableRegistry.getGcTime(primaryTable) : cacheConfig.defaultGcTime),
  });

  // ─────────────────────────────────────────────────────────────────────────
  // COMBINE RESULTS
  // ─────────────────────────────────────────────────────────────────────────

  const data = useMemo((): TData | undefined => {
    if (isAnalyticsPath) {
      const rawData = analyticsResult.rows;
      return selectQueryResultData(rawData, select);
    }
    if (isTransactionalPath) {
      const rawData = transactionalResult.data;
      if (rawData === undefined) return undefined;
      return selectQueryResultData(rawData, select);
    }
    return undefined;
  }, [
    isAnalyticsPath,
    isTransactionalPath,
    analyticsResult.rows,
    transactionalResult.data,
    select,
  ]);

  // ─────────────────────────────────────────────────────────────────────────
  // ACTIONS
  // ─────────────────────────────────────────────────────────────────────────

  const refetch = useCallback(async (): Promise<void> => {
    if (isAnalyticsPath) {
      await analyticsResult.refetch();
    } else if (isTransactionalPath) {
      await transactionalResult.refetch();
    }
  }, [isAnalyticsPath, isTransactionalPath, analyticsResult, transactionalResult]);

  const invalidate = useCallback(async (): Promise<void> => {
    const key = isAnalyticsPath ? analyticsQueryKey : transactionalQueryKey;
    await queryClient.invalidateQueries({ queryKey: key });
  }, [isAnalyticsPath, analyticsQueryKey, transactionalQueryKey, queryClient]);

  // ─────────────────────────────────────────────────────────────────────────
  // BUILD RESULT (Discriminated Union)
  // ─────────────────────────────────────────────────────────────────────────

  const baseResult = {
    data,
    isOffline: !isOnline,
    tables: tables,
    primaryTable: primaryTable,
    refetch,
    invalidate,
  };

  // Analytics compilation error - surface immediately instead of silently pending
  if (isAnalyticsPath && compilationError !== null) {
    return {
      ...baseResult,
      executionPath: EXECUTION_PATHS.ANALYTICS,
      isLoading: false,
      isFetching: false,
      isSuccess: false,
      isError: true,
      error: compilationError,
      isStale: false,
      lastUpdatedAt: null,
      dataSource: DATA_SOURCES.NONE,
      sql: null,
      executionTimeMs: null,
      isDownloadingFiles: false as const,
      downloadProgress: 0 as const,
      filesToDownload: 0 as const,
      filesDownloaded: 0 as const,
    } satisfies UseDLQueryEngineResult<TData>;
  }

  // Analytics result
  if (isAnalyticsPath && compiledSql !== null) {
    const dataSource = analyticsResult.data
      ? DATA_SOURCES.DUCKDB
      : DATA_SOURCES.NONE;

    return {
      ...baseResult,
      executionPath: EXECUTION_PATHS.ANALYTICS,
      isLoading: analyticsResult.isLoading || downloadState.isDownloading,
      isFetching: analyticsResult.isFetching,
      isSuccess: analyticsResult.isSuccess,
      isError: analyticsResult.isError,
      error: analyticsResult.error ?? null,
      isStale: analyticsResult.isStale ?? false,
      lastUpdatedAt: analyticsResult.dataUpdatedAt ?? null,
      dataSource,
      sql: compiledSql,
      executionTimeMs: analyticsResult.executionTimeMs ?? null,
      isDownloadingFiles: downloadState.isDownloading,
      downloadProgress: downloadState.progress,
      filesToDownload: downloadState.filesTotal,
      filesDownloaded: downloadState.filesCompleted,
    } satisfies UseDLQueryEngineResult<TData>;
  }

  // Transactional result
  if (isTransactionalPath) {
    const dataSource = transactionalResult.data
      ? isOnline
        ? DATA_SOURCES.CONVEX
        : DATA_SOURCES.CACHE
      : DATA_SOURCES.NONE;

    return {
      ...baseResult,
      executionPath: EXECUTION_PATHS.TRANSACTIONAL,
      isLoading: transactionalResult.isLoading,
      isFetching: transactionalResult.isFetching,
      isSuccess: transactionalResult.isSuccess,
      isError: transactionalResult.isError,
      error: transactionalResult.error ?? null,
      isStale: transactionalResult.isStale ?? false,
      lastUpdatedAt: transactionalResult.dataUpdatedAt ?? null,
      dataSource,
      sql: null,
      executionTimeMs: null,
      isDownloadingFiles: false as const,
      downloadProgress: 0 as const,
      filesToDownload: 0 as const,
      filesDownloaded: 0 as const,
    } satisfies UseDLQueryEngineResult<TData>;
  }

  // Pending result (no decision yet)
  return {
    ...baseResult,
    executionPath: null,
    isLoading: true,
    isFetching: false,
    isSuccess: false,
    isError: false,
    error: null,
    isStale: false,
    lastUpdatedAt: null,
    dataSource: DATA_SOURCES.NONE,
    sql: null,
    executionTimeMs: null,
    isDownloadingFiles: false as const,
    downloadProgress: 0 as const,
    filesToDownload: 0 as const,
    filesDownloaded: 0 as const,
  } satisfies UseDLQueryEngineResult<TData>;
};
