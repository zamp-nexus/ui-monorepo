/**
 * @foundation/data-layer
 *
 * Public API surface for the data layer library.
 * Internal composition details are intentionally not exported here.
 *
 * @packageDocumentation
 */

// Provider
export {
  DataLayerProvider,
  DataLayerContext,
  useDataLayer,
  DataLayerInternalsContext,
  useDataLayerInternals,
  type DataLayerInternals,
  type DataLayerProviderProps,
  type DataLayerConfig,
  type DataLayerContextValue,
} from './provider';

// Query hooks
export {
  useDLGet,
  useDLGetList,
  useDLGetOne,
  type UseDLGetOptions,
  type DLGetResult,
} from './hooks/use-dl-get';

// Mutation hooks
export {
  useDLCreate,
  type UseDLCreateOptions,
} from './hooks/use-dl-create';
export {
  useDLUpdate,
  type UseDLUpdateOptions,
} from './hooks/use-dl-update';
export {
  useDLDelete,
  type UseDLDeleteOptions,
} from './hooks/use-dl-delete';

// Analytics hooks
export {
  useDLAnalytics,
  createAnalyticsQueryKey,
  type UseDLAnalyticsOptions,
  type DLAnalyticsResult,
} from './hooks/use-dl-analytics';
export {
  useDLAnalyticsMutation,
  useCreateAnalyticsView,
  useDropAnalyticsView,
  useExecuteAnalyticsSql,
  useLoadParquetFile,
  useCopyToParquet,
  type UseDLAnalyticsMutationOptions,
  type DLAnalyticsMutationResult,
} from './hooks/use-dl-analytics-mutation';

// Sync and conflict hooks
export {
  useSyncStatus,
  useSyncTrigger,
  useSyncEventListener,
  type SyncStatus,
} from './hooks/use-sync-status';
export {
  useConflictResolution,
  useEntityConflict,
  type ConflictInfo,
  type ConflictResolution,
} from './hooks/use-conflict-resolution';

// Convenience state hooks
export { useIsOnline } from './hooks/use-is-online';
export { useIsDuckDBAvailable } from './hooks/use-is-duckdb-available';
export { usePendingMutationCount } from './hooks/use-pending-mutation-count';
export {
  useBackgroundFileSync,
  INITIAL_DOWNLOAD_STATE as BACKGROUND_SYNC_INITIAL_DOWNLOAD_STATE,
  type UseBackgroundFileSyncOptions,
  type UseBackgroundFileSyncResult,
  type BackgroundSyncState,
  type DownloadProgressState,
} from './analytics-sync';

// Core types and configuration
export type {
  CacheConfig,
  ResolvedCacheConfig,
  UnifiedTableConfig,
  TableAnalyticsConfig,
  BaseMutationOptions,
  DLMutationResult,
  OptimisticMetadata,
  ConvexQueryReference,
  AnyFunctionReference,
} from './core/types';
export {
  DEFAULT_CACHE_TTL,
  DEFAULT_CACHE_CONFIG,
  DEFAULT_RETRY_CONFIG,
  QUERY_RETRY_MAX,
  QUERY_RETRY_DELAY_BASE_MS,
  QUERY_RETRY_DELAY_MAX_MS,
  OFFLINE_NETWORK_MODE,
  ANALYTICS_QUERY_RETRY_MAX,
  TABLE_OPERATION,
  CONFLICT_RESOLUTION_TYPE,
  resolveCacheConfig,
  DATA_FRESHNESS,
  TableRegistry,
  createTableRegistry,
} from './core';
export type { DataFreshnessLevel } from './core/table-registry';
export type { ConflictResolutionType, TableOperation } from './core/constants';

// Advanced instance composition
export {
  DataLayerContainer,
  createDataLayerContainer,
  type DataLayerDependencies,
  type DependencyFactories,
  type ContainerConfig,
} from './core/container';
