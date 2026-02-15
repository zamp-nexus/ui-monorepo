/**
 * Data Layer Provider
 *
 * Unified data layer integrating all foundation libraries:
 * - foundation-database: DatabaseFacade for persistence
 * - foundation-sync-engine: SyncCoordinator for offline sync
 * - foundation-bridge: DuckDBRouter for analytics
 *
 * Uses DataLayerContainer for centralized dependency management.
 * Uses ConvexQueryClient for live subscriptions per Convex docs.
 *
 * Key features:
 * - Uses container for single database instance (no double creation)
 * - Proper async disposal with error handling
 * - All promise rejections are handled
 * - No silent error swallowing
 *
 * @module provider/data-layer-provider
 */

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { ConvexProvider } from 'convex/react';

import type { SyncEvent } from '@open-insights-web/foundation-data-model';
import { SYNC_EVENT_TYPE } from '@open-insights-web/foundation-data-model';
import { hashPayloadSync, createLogger, type Logger } from '@open-insights-web/foundation-utils';

import type { DataLayerConfig, DataLayerContextValue } from '../core/types';
import {
  DataLayerContainer,
  type DataLayerDependencies,
} from '../core/container';
import { DataLayerContext } from './data-layer-context';
import {
  DataLayerInternalsContext,
  type DataLayerInternals,
} from './data-layer-internals-context';

// =============================================================================
// Provider Props
// =============================================================================

export interface DataLayerProviderProps {
  /** Data layer configuration */
  readonly config: DataLayerConfig;
  /** Children */
  readonly children: ReactNode;
  /** Loading component */
  readonly loadingComponent?: ReactNode;
  /** Error component */
  readonly errorComponent?: (error: Error) => ReactNode;
}

const getDatasourceApiFingerprint = (
  datasourceApi: DataLayerConfig['datasourceApi']
): Record<string, unknown> | null => {
  if (!datasourceApi || typeof datasourceApi !== 'object') {
    return null;
  }

  const value = datasourceApi as Record<string, unknown>;
  return {
    type: value['_type'] ?? null,
    visibility: value['_visibility'] ?? null,
    name: value['_name'] ?? null,
    path: value['_path'] ?? null,
  };
};

// =============================================================================
// Provider Component
// =============================================================================

/**
 * Data Layer Provider
 *
 * Wraps your app with all necessary providers for the data layer,
 * integrating foundation-database, foundation-sync-engine, and foundation-bridge.
 *
 * @example
 * ```tsx
 * import { DataLayerProvider } from '@open-insights-web/foundation-data-layer';
 *
 * const App = () => (
 *   <DataLayerProvider
 *     config={{
 *       convexUrl: process.env.CONVEX_URL,
 *       conflictStrategy: CONFLICT_STRATEGY.LAST_WRITE_WINS,
 *       enableCrossTab: true,
 *     }}
 *     loadingComponent={<Spinner />}
 *   >
 *     <YourApp />
 *   </DataLayerProvider>
 * );
 * ```
 */
export const DataLayerProvider = ({
  config,
  children,
  loadingComponent,
  errorComponent,
}: DataLayerProviderProps): React.ReactElement => {
  // State
  const [isInitialized, setIsInitialized] = useState(false);
  const [isOnline, setIsOnline] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [pendingSyncCount, setPendingSyncCount] = useState(0);
  const [lastSyncedAt, setLastSyncedAt] = useState<number | null>(null);
  const [isLeader, setIsLeader] = useState(false);
  const [deps, setDeps] = useState<DataLayerDependencies | null>(null);
  const [error, setError] = useState<Error | null>(null);

  // Refs
  const containerRef = useRef<DataLayerContainer | null>(null);
  const syncUnsubscribeRef = useRef<(() => void) | null>(null);

  // Create a logger for the provider. Uses 'warn' level by default so errors/warnings
  // are always visible; switches to 'debug' when debug config is enabled.
  const loggerRef = useRef<Logger>(createLogger('DataLayerProvider', { level: config.debug ? 'debug' : 'warn' }));
  loggerRef.current = createLogger('DataLayerProvider', { level: config.debug ? 'debug' : 'warn' });

  // Use ref for config values that shouldn't trigger re-initialization
  // This prevents stale closures while only re-initializing on convexUrl change
  const configRef = useRef<DataLayerConfig>(config);
  configRef.current = config;

  // Compute a stable hash of config to detect meaningful changes
  // Excludes function references (callbacks) since they can't be reliably hashed
  const configHash = useMemo(() => {
    const hashableConfig = {
      convexUrl: config.convexUrl,
      tables: config.tables,
      conflictStrategy: config.conflictStrategy,
      enableCrossTab: config.enableCrossTab,
      enableAnalytics: config.enableAnalytics,
      defaultStaleTime: config.defaultStaleTime,
      defaultGcTime: config.defaultGcTime,
      cache: config.cache,
      debug: config.debug,
      datasourceApi: getDatasourceApiFingerprint(config.datasourceApi),
    };
    return hashPayloadSync(hashableConfig);
  }, [config]);

  // Derived state
  const isDuckDBAvailable = deps?.analyticsEnabled ?? false;

  // Initialize data layer using container
  // Re-initialize when any meaningful config property changes (detected via hash)
  useEffect(() => {
    let mounted = true;

    // Access config via ref to get current values without stale closures
    const currentConfig = configRef.current;

    // Create container with current config
    const container = new DataLayerContainer({
      convexUrl: currentConfig.convexUrl,
      ...(currentConfig.tables !== undefined ? { tables: currentConfig.tables } : {}),
      ...(currentConfig.datasourceApi !== undefined
        ? { datasourceApi: currentConfig.datasourceApi }
        : {}),
      ...(currentConfig.conflictStrategy !== undefined
        ? { conflictStrategy: currentConfig.conflictStrategy }
        : {}),
      ...(currentConfig.enableCrossTab !== undefined
        ? { enableCrossTab: currentConfig.enableCrossTab }
        : {}),
      ...(currentConfig.enableAnalytics !== undefined
        ? { enableAnalytics: currentConfig.enableAnalytics }
        : {}),
      ...(currentConfig.defaultStaleTime !== undefined
        ? { defaultStaleTime: currentConfig.defaultStaleTime }
        : {}),
      ...(currentConfig.defaultGcTime !== undefined ? { defaultGcTime: currentConfig.defaultGcTime } : {}),
      ...(currentConfig.cache !== undefined ? { cache: currentConfig.cache } : {}),
      ...(currentConfig.debug !== undefined ? { debug: currentConfig.debug } : {}),
      ...(currentConfig.onSyncError !== undefined
        ? { onSyncError: currentConfig.onSyncError }
        : {}),
    });

    containerRef.current = container;

    // Helper function to handle sync events
    const handleSyncEvent = (
      event: SyncEvent,
      dependencies: DataLayerDependencies,
      isMounted: boolean,
      containerInstance: DataLayerContainer,
    ): void => {
      if (!isMounted || containerInstance.isDisposed) return;

      switch (event.type) {
        case SYNC_EVENT_TYPE.ONLINE:
          setIsOnline(true);
          break;

        case SYNC_EVENT_TYPE.OFFLINE:
          setIsOnline(false);
          break;

        case SYNC_EVENT_TYPE.SYNC_START:
          setIsSyncing(true);
          break;

        case SYNC_EVENT_TYPE.SYNC_COMPLETE:
          setIsSyncing(false);
          setLastSyncedAt(event.timestamp);
          break;

        case SYNC_EVENT_TYPE.SYNC_ERROR:
          setIsSyncing(false);
          break;

        case SYNC_EVENT_TYPE.QUEUE_PROCESSED:
          // Update pending count after queue processing
          // Properly handle the promise
          dependencies.syncCoordinator.getState()
            .then((state) => {
              if (isMounted && !containerInstance.isDisposed) {
                setPendingSyncCount(state.pendingMutations);
              }
            })
            .catch((err) => {
              loggerRef.current.warn('Failed to get sync state:', err);
            });
          break;
      }
    };

    // Initialize
    container.initialize()
      .then(async (dependencies) => {
        if (!mounted || container.isDisposed) return;

        // Subscribe to sync events (consolidated - handles both sync events and leader changes)
        const unsubscribe = dependencies.syncCoordinator.subscribe(
          (event: SyncEvent) => {
            if (!mounted || container.isDisposed) return;

            // Handle leader-changed events
            if (event.type === SYNC_EVENT_TYPE.LEADER_CHANGED && event.data?.isLeader !== undefined) {
              setIsLeader(event.data.isLeader);
            }

            // Handle other sync events
            handleSyncEvent(event, dependencies, mounted, container);
          }
        );
        syncUnsubscribeRef.current = unsubscribe;

        // Get initial sync state
        try {
          const initialState = await dependencies.syncCoordinator.getState();
          if (mounted && !container.isDisposed) {
            setIsOnline(initialState.isOnline);
            setIsSyncing(initialState.isSyncing);
            setPendingSyncCount(initialState.pendingMutations);
            setLastSyncedAt(initialState.lastSyncAt);
            setIsLeader(initialState.isLeader);
          }
        } catch (err) {
          // Log but don't fail - state will be updated via events
          loggerRef.current.warn('Failed to get initial sync state:', err);
        }

        if (mounted && !container.isDisposed) {
          setDeps(dependencies);
          setIsInitialized(true);
        }
      })
      .catch((err) => {
        if (mounted && !container.isDisposed) {
          const initError = err instanceof Error ? err : new Error(String(err));
          loggerRef.current.error('Initialization failed:', initError);
          setError(initError);
        }
      });

    // Cleanup function
    return () => {
      mounted = false;

      // Unsubscribe from sync events
      if (syncUnsubscribeRef.current) {
        syncUnsubscribeRef.current();
        syncUnsubscribeRef.current = null;
      }

      // Dispose container with proper error handling
      // This is async but we handle the promise
      container.dispose().catch((err) => {
        loggerRef.current.error('Disposal error:', err);
      });

      containerRef.current = null;
    };
  }, [configHash]); // Re-run when any meaningful config property changes

  // Sync now - force immediate sync
  const syncNow = useCallback(async () => {
    if (!deps?.syncCoordinator) return;
    await deps.syncCoordinator.sync();
  }, [deps?.syncCoordinator]);

  // Clear cache
  const clearCache = useCallback(async () => {
    if (deps?.database) {
      await deps.database.clearAll();
    }
    deps?.queryClient.clear();
  }, [deps?.database, deps?.queryClient]);

  // Get sync state for context
  const syncState = useMemo(() => {
    if (!deps?.syncCoordinator) return null;
    return {
      isOnline,
      isSyncing,
      lastSyncAt: lastSyncedAt,
      pendingMutations: pendingSyncCount,
      failedMutations: 0,
      isLeader,
    };
  }, [deps?.syncCoordinator, isOnline, isSyncing, lastSyncedAt, pendingSyncCount, isLeader]);

  // Public context value
  const contextValue = useMemo<DataLayerContextValue>(
    () => ({
      isOnline,
      isInitialized,
      isDuckDBAvailable: isDuckDBAvailable ?? false,
      isSyncing,
      pendingSyncCount,
      lastSyncedAt,
      isLeader,
      syncState,
      syncNow,
      clearCache,
    }),
    [
      isOnline,
      isInitialized,
      isDuckDBAvailable,
      isSyncing,
      pendingSyncCount,
      lastSyncedAt,
      isLeader,
      syncState,
      syncNow,
      clearCache,
    ]
  );

  // Internal context value for hooks
  const internalsValue = useMemo<DataLayerInternals | null>(() => {
    if (!deps) return null;

    return {
      queryClient: deps.queryClient,
      convexClient: deps.convexClient,
      convexQueryClient: deps.convexQueryClient,
      database: deps.database,
      syncCoordinator: deps.syncCoordinator,
      duckdbRouter: deps.duckdbRouter,
      opfsManager: deps.opfsManager,
      analyticsEnabled: deps.analyticsEnabled,
      initializeAnalytics: deps.initializeAnalytics,
      isOnline,
      cacheConfig: deps.cacheConfig,
      tableRegistry: deps.tableRegistry,
      datasourceApi: deps.datasourceApi,
      getTableSyncService: deps.getTableSyncService,
      getFileDownloadService: deps.getFileDownloadService,
    };
  }, [deps, isOnline]);

  // Handle error state
  if (error) {
    if (errorComponent) {
      return <>{errorComponent(error)}</>;
    }
    return <div>Data layer initialization failed: {error.message}</div>;
  }

  // Handle loading state
  if (!isInitialized || !internalsValue || !deps) {
    return <React.Fragment>{loadingComponent}</React.Fragment>;
  }

  // Render with providers
  return (
    <DataLayerContext.Provider value={contextValue}>
      <DataLayerInternalsContext.Provider value={internalsValue}>
        <ConvexProvider client={deps.convexClient}>
          <QueryClientProvider client={deps.queryClient}>
            {children}
          </QueryClientProvider>
        </ConvexProvider>
      </DataLayerInternalsContext.Provider>
    </DataLayerContext.Provider>
  );
};
