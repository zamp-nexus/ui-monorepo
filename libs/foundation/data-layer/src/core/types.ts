/**
 * Core Types for Data Layer
 *
 * Shared type definitions integrating with foundation libraries.
 * Hook-specific types are colocated with their hook files.
 *
 * NOTE: For utility types (WithId, WithRequiredId, ExtractId, PartialBy, OfflineMetadata, OfflineDataSource),
 * import directly from @open-insights-web/foundation-data-model.
 *
 * NOTE: For type guards (hasId, has_Id, hasAnyId, getEntityId, matchesEntityId),
 * import directly from @open-insights-web/foundation-data-model.
 *
 * @module core/types
 */

import type { QueryKey } from '@tanstack/react-query';
import type { AxiosInstance } from 'axios';
import type { FunctionArgs, FunctionReference, FunctionReturnType } from 'convex/server';

import type { ConflictStrategy, SyncState } from '@open-insights-web/foundation-data-model';

import type { TableAnalyticsConfig, UnifiedTableConfig } from './table-registry';

const CONVEX_FUNCTION_VISIBILITY = {
  PUBLIC: 'public',
  INTERNAL: 'internal',
} as const;

type ConvexFunctionVisibility =
  (typeof CONVEX_FUNCTION_VISIBILITY)[keyof typeof CONVEX_FUNCTION_VISIBILITY];

/**
 * Generic Convex query function reference type.
 * Used for typing datasource API and other query references.
 *
 * Note: We use a generic signature here because Convex function references
 * have complex internal types that vary by deployment.
 */
export type ConvexQueryReference = FunctionReference<
  'query',
  'public',
  Record<string, unknown>,
  unknown
>;

/**
 * Generic Convex function reference for any visibility and args.
 * Used when the specific function signature is not known at compile time.
 */
export type AnyFunctionReference = FunctionReference<
  'query',
  ConvexFunctionVisibility,
  Record<string, unknown>,
  unknown
>;

// Re-export table config types for convenience (these are defined in this library)
export type { UnifiedTableConfig, TableAnalyticsConfig };

// =============================================================================
// Configuration
// =============================================================================

/**
 * Cache configuration options
 */
export interface CacheConfig {
  /** Default stale time in milliseconds (default: 5 minutes) */
  readonly defaultStaleTime?: number;
  /** Default GC time in milliseconds (default: 24 hours) */
  readonly defaultGcTime?: number;
  /** Analytics stale time in milliseconds (default: 10 minutes) */
  readonly analyticsStaleTime?: number;
  /** Analytics GC time in milliseconds (default: 1 hour) */
  readonly analyticsGcTime?: number;
}

/**
 * Resolved cache configuration with defaults applied
 */
export interface ResolvedCacheConfig {
  readonly defaultStaleTime: number;
  readonly defaultGcTime: number;
  readonly analyticsStaleTime: number;
  readonly analyticsGcTime: number;
}

/**
 * Data layer configuration
 */
export interface DataLayerConfig {
  /** Convex deployment URL */
  readonly convexUrl: string;

  /**
   * Unified table registry - single source of truth.
   * Define table configs here and they'll be shared across:
   * - DataLayer (API calls, caching)
   * - SyncEngine (conflict resolution, offline sync)
   * - QueryEngine (routing decisions, analytics)
   */
  readonly tables?: ReadonlyArray<UnifiedTableConfig>;

  /**
   * Global datasource API reference for background file sync.
   *
   * This Convex query returns parquet file metadata for requested tables.
   * Used by useBackgroundFileSync hook to download analytics data files.
   *
   * Signature: (args: { tables: string[] }) => DataSourceResponse
   *
   * @example
   * ```typescript
   * datasourceApi: api.datasource.list
   * ```
   */
  readonly datasourceApi?: ConvexQueryReference;

  /** Conflict resolution strategy (default: CONFLICT_STRATEGY.LAST_WRITE_WINS) */
  readonly conflictStrategy?: ConflictStrategy;

  /** Enable cross-tab sync coordination (default: true) */
  readonly enableCrossTab?: boolean;

  /** Enable DuckDB analytics (default: true) */
  readonly enableAnalytics?: boolean;

  /** Default stale time for queries in ms (default: 5 minutes) */
  readonly defaultStaleTime?: number;

  /** Default garbage collection time for queries in ms (default: 24 hours) */
  readonly defaultGcTime?: number;

  /** Cache configuration overrides */
  readonly cache?: CacheConfig;

  /** Optional shared Axios instance used for network paths in dependent foundation libs */
  readonly axiosInstance?: AxiosInstance;

  /** Enable debug logging */
  readonly debug?: boolean;

  /** Sync error callback */
  readonly onSyncError?: (error: Error, context?: string) => void;
}

// =============================================================================
// Context Types
// =============================================================================

/**
 * Public data layer context value
 */
export interface DataLayerContextValue {
  /** Whether online */
  readonly isOnline: boolean;
  /** Whether data layer is initialized */
  readonly isInitialized: boolean;
  /** Whether DuckDB is available */
  readonly isDuckDBAvailable: boolean;
  /** Whether currently syncing */
  readonly isSyncing: boolean;
  /** Number of mutations pending sync */
  readonly pendingSyncCount: number;
  /** Timestamp of last successful sync */
  readonly lastSyncedAt: number | null;
  /** Whether this tab is the sync leader (cross-tab) */
  readonly isLeader: boolean;
  /** Current sync state from coordinator */
  readonly syncState: SyncState | null;

  /** Force immediate sync */
  readonly syncNow: () => Promise<void>;
  /** Clear all cached data */
  readonly clearCache: () => Promise<void>;
}

// =============================================================================
// Mutation Types (Shared across hooks)
// =============================================================================

/**
 * Base mutation options shared across create/update/delete
 */
export interface BaseMutationOptions<
  TMutation extends FunctionReference<'mutation'>,
  TData = FunctionReturnType<TMutation>,
  TVariables = FunctionArgs<TMutation>,
> {
  /** Convex mutation function reference */
  readonly mutation: TMutation;
  /** Table name for caching and offline queue */
  readonly table: string;
  /** Query keys to invalidate on success */
  readonly invalidateKeys?: QueryKey[];
  /** Called when mutation succeeds */
  readonly onSuccess?: (data: TData | undefined, variables: TVariables) => void | Promise<void>;
  /** Called when mutation fails */
  readonly onError?: (error: Error, variables: TVariables) => void | Promise<void>;
  /** Called when mutation settles */
  readonly onSettled?: (
    data: TData | undefined,
    error: Error | null,
    variables: TVariables,
  ) => void | Promise<void>;
}

/**
 * Result from mutation hooks
 */
export interface DLMutationResult<TData, TVariables> {
  /** The mutation result data */
  readonly data: TData | undefined;
  /** Whether mutation was queued for offline sync */
  readonly isQueued: boolean;
  /** Provisional ID for created items */
  readonly provisionalId: string | null;
  /** Whether currently offline */
  readonly isOffline: boolean;
  /** Whether mutation is pending */
  readonly isPending: boolean;
  /** Whether mutation is successful */
  readonly isSuccess: boolean;
  /** Whether mutation has error */
  readonly isError: boolean;
  /** Whether mutation is idle */
  readonly isIdle: boolean;
  /** Error if any */
  readonly error: Error | null;
  /** Mutate function */
  readonly mutate: (variables: TVariables) => void;
  /** Mutate async function */
  readonly mutateAsync: (variables: TVariables) => Promise<TData | undefined>;
  /** Reset mutation state */
  readonly reset: () => void;
}

// =============================================================================
// Data Layer Specific Types
// =============================================================================

/**
 * Optimistic metadata for mutations
 *
 * Attached to entities during optimistic updates to track sync status.
 * This is specific to data-layer's implementation.
 */
export interface OptimisticMetadata {
  /** Whether this item is pending server sync */
  readonly _isPendingSync?: boolean;
  /** Provisional ID before server assignment */
  readonly _provisionalId?: string;
  /** Timestamp when item was created locally */
  readonly _createdLocallyAt?: number;
}
