/**
 * Data Layer Internals Context
 *
 * Provides internal data layer state for hooks.
 * This context exposes low-level services that hooks need.
 *
 * Integrates with foundation libraries:
 * - foundation-database: DatabaseFacade
 * - foundation-sync-engine: SyncCoordinator
 * - foundation-bridge: DuckDBRouter
 *
 * @module provider/data-layer-internals-context
 */

import { createContext, useContext } from 'react';
import type { QueryClient } from '@tanstack/react-query';
import type { ConvexQueryClient } from '@convex-dev/react-query';
import type { ConvexReactClient } from 'convex/react';
import type { DatabaseFacade, OpfsManager } from '@open-insights-web/foundation-database';
import type { SyncCoordinator } from '@open-insights-web/foundation-sync-engine';
import type { DuckDBRouter } from '@open-insights-web/foundation-bridge';
import type { TableSyncService } from '../analytics-sync/table-sync-service';
import type { FileDownloadService } from '../analytics-sync/file-download-service';
import type { ResolvedCacheConfig, ConvexQueryReference } from '../core/types';
import type { TableRegistry } from '../core/table-registry';

/**
 * Internal data layer state accessible by hooks
 *
 * Uses foundation libraries:
 * - DatabaseFacade from foundation-database for persistence
 * - SyncCoordinator from foundation-sync-engine for offline sync
 * - DuckDBRouter from foundation-bridge for analytics
 * - TableRegistry for unified table metadata
 */
export interface DataLayerInternals {
  /** TanStack Query client */
  readonly queryClient: QueryClient;

  /** Convex React client */
  readonly convexClient: ConvexReactClient;

  /** Convex Query client for TanStack integration */
  readonly convexQueryClient: ConvexQueryClient;

  /** Database facade from foundation-database */
  readonly database: DatabaseFacade;

  /** Sync coordinator from foundation-sync-engine */
  readonly syncCoordinator: SyncCoordinator;

  /** DuckDB router from foundation-bridge (null if not available) */
  readonly duckdbRouter: DuckDBRouter | null;

  /** OPFS manager from foundation-database (null if not available) */
  readonly opfsManager: OpfsManager | null;

  /** Whether analytics runtime is enabled in config */
  readonly analyticsEnabled: boolean;

  /**
   * Lazily initialize analytics runtime.
   * Creates DuckDB + OPFS resources on first use.
   */
  readonly initializeAnalytics: () => Promise<{
    readonly duckdbRouter: DuckDBRouter;
    readonly opfsManager: OpfsManager | null;
  } | null>;

  /** Network online status */
  readonly isOnline: boolean;

  /** Resolved cache configuration */
  readonly cacheConfig: ResolvedCacheConfig;

  /**
   * Unified table registry - single source of truth for table metadata.
   * Used by DataLayer hooks, SyncEngine, and QueryEngine.
   */
  readonly tableRegistry: TableRegistry;

  /**
   * Global datasource API reference for background file sync.
   * Used by useBackgroundFileSync to fetch parquet file metadata.
   * Null if not configured.
   */
  readonly datasourceApi: ConvexQueryReference | null;
  /** Container-scoped table sync service accessor */
  readonly getTableSyncService: () => TableSyncService;
  /** Container-scoped file download service accessor */
  readonly getFileDownloadService: () => Promise<FileDownloadService | null>;
}

/**
 * Internal context for hooks to access low-level data layer internals
 */
export const DataLayerInternalsContext = createContext<DataLayerInternals | null>(null);

DataLayerInternalsContext.displayName = 'DataLayerInternalsContext';

/**
 * Hook to access data layer internals (for use by other data hooks)
 *
 * @internal
 * @example
 * ```tsx
 * // Inside a data hook
 * const { database, syncCoordinator, isOnline } = useDataLayerInternals();
 * ```
 */
export const useDataLayerInternals = (): DataLayerInternals => {
  const context = useContext(DataLayerInternalsContext);
  if (!context) {
    throw new Error('useDataLayerInternals must be used within a DataLayerProvider');
  }
  return context;
};
