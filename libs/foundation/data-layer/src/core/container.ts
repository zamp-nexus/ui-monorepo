/**
 * Data Layer Container
 *
 * Centralized dependency injection container for the data layer.
 * Manages initialization, disposal, and lifecycle of all dependencies.
 *
 * Key features:
 * - Single database instance shared across all components
 * - Proper async disposal with mutex protection
 * - Centralized error handling
 * - Factory overrides for testing
 *
 * @module core/container
 */

import { QueryClient } from '@tanstack/react-query';
import { ConvexQueryClient } from '@convex-dev/react-query';
import { ConvexReactClient } from 'convex/react';

import {
  DatabaseFacade,
  OpfsManager,
} from '@open-insights-web/foundation-database';
import {
  createSyncCoordinator,
  type SyncCoordinator,
} from '@open-insights-web/foundation-sync-engine';
import { ConflictStrategy } from '@open-insights-web/foundation-data-model';
import { Mutex, createLogger, type Logger } from '@open-insights-web/foundation-utils';
import {
  DuckDBRouter,
} from '@open-insights-web/foundation-bridge';

import type { CacheConfig, ResolvedCacheConfig, UnifiedTableConfig, AnyFunctionReference } from './types';
import {
  DEFAULT_CACHE_CONFIG,
  OFFLINE_NETWORK_MODE,
  QUERY_RETRY_DELAY_BASE_MS,
  QUERY_RETRY_DELAY_MAX_MS,
  QUERY_RETRY_MAX,
  resolveCacheConfig,
} from './constants';
import { type TableRegistry, createTableRegistry } from './table-registry';

/**
 * Dependencies managed by the container
 */
export interface DataLayerDependencies {
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
   * Creates DuckDB and OPFS resources only when analytics is first used.
   */
  readonly initializeAnalytics: () => Promise<{
    readonly duckdbRouter: DuckDBRouter;
    readonly opfsManager: OpfsManager | null;
  } | null>;
  /** TanStack Query client */
  readonly queryClient: QueryClient;
  /** Convex React client */
  readonly convexClient: ConvexReactClient;
  /** Convex Query client for TanStack integration */
  readonly convexQueryClient: ConvexQueryClient;
  /** Resolved cache configuration */
  readonly cacheConfig: ResolvedCacheConfig;
  /** Unified table registry - single source of truth for table metadata */
  readonly tableRegistry: TableRegistry;
  /** Global datasource API reference for background file sync (null if not configured) */
  readonly datasourceApi: AnyFunctionReference | null;
}

/**
 * Factory functions for creating dependencies (for testing)
 */
export interface DependencyFactories {
  /** Create database facade */
  readonly database: () => DatabaseFacade;
  /** Create sync coordinator */
  readonly syncCoordinator: (config: {
    queryClient: QueryClient;
    convexClient: ConvexReactClient;
    database: DatabaseFacade;
    conflictStrategy: ConflictStrategy;
    enableCrossTab: boolean;
    autoStart: boolean;
    debug: boolean;
    onError?: (error: Error, context?: string) => void;
  }) => SyncCoordinator;
  /** Create DuckDB router */
  readonly duckdbRouter: () => DuckDBRouter;
  /** Create OPFS manager */
  readonly opfsManager: (database: DatabaseFacade) => OpfsManager;
}

/**
 * Container configuration
 */
export interface ContainerConfig {
  /** Convex deployment URL */
  readonly convexUrl: string;
  /**
   * Unified table registry - single source of truth for table metadata.
   * Tables defined here are shared across DataLayer, SyncEngine, and QueryEngine.
   */
  readonly tables?: ReadonlyArray<UnifiedTableConfig>;
  /**
   * Global datasource API reference for background file sync.
   * Used by useBackgroundFileSync to fetch parquet file metadata.
   */
  readonly datasourceApi?: AnyFunctionReference;
  /** Conflict resolution strategy */
  readonly conflictStrategy?: ConflictStrategy;
  /** Enable cross-tab sync */
  readonly enableCrossTab?: boolean;
  /** Enable DuckDB analytics */
  readonly enableAnalytics?: boolean;
  /** Default stale time for queries */
  readonly defaultStaleTime?: number;
  /** Default GC time for queries */
  readonly defaultGcTime?: number;
  /** Cache configuration */
  readonly cache?: CacheConfig;
  /** Enable debug logging */
  readonly debug?: boolean;
  /** Sync error callback */
  readonly onSyncError?: (error: Error, context?: string) => void;
  /** Factory overrides for testing */
  readonly factories?: Partial<DependencyFactories>;
}

/**
 * Data Layer Container - Manages all data layer dependencies
 *
 * Provides:
 * - Single database instance (no double creation)
 * - Centralized initialization
 * - Proper async disposal with mutex protection
 * - Factory overrides for testing
 */
export class DataLayerContainer {
  private deps: DataLayerDependencies | null = null;
  private disposed = false;
  private initPromise: Promise<DataLayerDependencies> | null = null;
  private readonly disposeMutex = new Mutex();
  private readonly analyticsInitMutex = new Mutex();
  private analyticsRuntime:
    | {
        readonly duckdbRouter: DuckDBRouter;
        readonly opfsManager: OpfsManager | null;
      }
    | null = null;
  private readonly config: ContainerConfig;
  private readonly logger: Logger;

  constructor(config: ContainerConfig) {
    this.config = config;
    // Use 'debug' level when debug is enabled (shows all messages),
    // otherwise 'warn' level (only shows warnings and errors, which are critical during disposal).
    this.logger = createLogger('DataLayerContainer', { level: config.debug ? 'debug' : 'warn' });
  }

  /**
   * Log helper using foundation-utils logger
   */
  private log = (message: string, ...args: unknown[]): void => {
    this.logger.debug(message, ...args);
  };

  /**
   * Initialize all dependencies
   *
   * - Idempotent: multiple calls return the same promise
   * - Returns existing deps if already initialized
   */
  initialize = async (): Promise<DataLayerDependencies> => {
    if (this.disposed) {
      throw new Error('[DataLayerContainer] Container is disposed');
    }

    // Already initialized
    if (this.deps) {
      return this.deps;
    }

    // Already initializing
    if (this.initPromise) {
      return this.initPromise;
    }

    // Start initialization
    this.initPromise = this.doInitialize();

    try {
      const deps = await this.initPromise;
      this.deps = deps;
      return deps;
    } finally {
      this.initPromise = null;
    }
  };

  /**
   * Internal initialization logic
   */
  private doInitialize = async (): Promise<DataLayerDependencies> => {
    this.log('Initializing container');

    // Resolve cache config first
    const cacheConfig = resolveCacheConfig(this.config.cache) ?? {
      ...DEFAULT_CACHE_CONFIG,
      defaultStaleTime: this.config.defaultStaleTime ?? DEFAULT_CACHE_CONFIG.defaultStaleTime,
      defaultGcTime: this.config.defaultGcTime ?? DEFAULT_CACHE_CONFIG.defaultGcTime,
    };

    // Create TableRegistry from unified table config
    const tableRegistry = createTableRegistry(this.config.tables ?? [], {
      staleTime: cacheConfig.defaultStaleTime,
      gcTime: cacheConfig.defaultGcTime,
      conflictStrategy: this.config.conflictStrategy ?? ConflictStrategy.LAST_WRITE_WINS,
      debug: this.config.debug,
    });
    this.log('Table registry created with', tableRegistry.getTableNames().length, 'tables');

    // Create Convex clients
    const convexClient = new ConvexReactClient(this.config.convexUrl);
    const convexQueryClient = new ConvexQueryClient(convexClient);

    // Create QueryClient with Convex integration
    const queryClient = this.createQueryClient(convexQueryClient, cacheConfig);

    // Create database facade - instance scoped (no shared singleton reset hazards)
    const database =
      this.config.factories?.database?.() ?? DatabaseFacade.create({ debug: this.config.debug });

    // Create sync coordinator using SAME database instance
    // Pass the underlying InsightsDatabase from facade to prevent duplicate instances
    const syncCoordinator = this.config.factories?.syncCoordinator?.({
      queryClient,
      convexClient,
      database,
      conflictStrategy: this.config.conflictStrategy ?? ConflictStrategy.LAST_WRITE_WINS,
      enableCrossTab: this.config.enableCrossTab ?? true,
      autoStart: true,
      debug: this.config.debug ?? false,
      onError: this.config.onSyncError,
    }) ?? createSyncCoordinator({
      queryClient,
      convexClient,
      // Pass the underlying InsightsDatabase from facade
      // This ensures a single database instance is shared across all components
      database: database.getDatabase(),
      conflictStrategy: this.config.conflictStrategy ?? ConflictStrategy.LAST_WRITE_WINS,
      enableCrossTab: this.config.enableCrossTab ?? true,
      autoStart: true,
      debug: this.config.debug,
      onError: this.config.onSyncError,
    });

    // Start auto-cleanup for expired cache entries
    database.startCleanup();

    this.log('Container initialized');

    return {
      database,
      syncCoordinator,
      duckdbRouter: null,
      opfsManager: null,
      analyticsEnabled: this.config.enableAnalytics !== false,
      initializeAnalytics: () => this.ensureAnalyticsRuntime(database),
      queryClient,
      convexClient,
      convexQueryClient,
      cacheConfig,
      tableRegistry,
      datasourceApi: this.config.datasourceApi ?? null,
    };
  };

  /**
   * Lazily initialize analytics runtime (DuckDB + OPFS).
   *
   * This keeps provider initialization light and defers large analytics costs
   * until the first analytics hook actually needs them.
   */
  private ensureAnalyticsRuntime = async (
    database: DatabaseFacade
  ): Promise<{
    readonly duckdbRouter: DuckDBRouter;
    readonly opfsManager: OpfsManager | null;
  } | null> => {
    if (this.config.enableAnalytics === false) {
      return null;
    }

    if (this.analyticsRuntime) {
      return this.analyticsRuntime;
    }

    return this.analyticsInitMutex.runExclusive(async () => {
      if (this.analyticsRuntime) {
        return this.analyticsRuntime;
      }

      try {
        const duckdbRouter =
          this.config.factories?.duckdbRouter?.() ?? new DuckDBRouter({ debug: this.config.debug });
        const opfsManager =
          this.config.factories?.opfsManager?.(database) ??
          new OpfsManager({
            debug: this.config.debug,
            database: database.getDatabase(),
          });

        this.analyticsRuntime = { duckdbRouter, opfsManager };
        this.log('Analytics runtime initialized lazily');

        return this.analyticsRuntime;
      } catch (error) {
        this.logger.warn('Analytics runtime unavailable', error);
        return null;
      }
    });
  };

  /**
   * Create QueryClient with Convex integration
   */
  private createQueryClient = (
    convexQueryClient: ConvexQueryClient,
    cacheConfig: ResolvedCacheConfig
  ): QueryClient => {
    const client = new QueryClient({
      defaultOptions: {
        queries: {
          // Wire up Convex for live subscriptions
          queryKeyHashFn: convexQueryClient.hashFn(),
          queryFn: convexQueryClient.queryFn(),
          // Offline-first defaults
          staleTime: cacheConfig.defaultStaleTime,
          gcTime: cacheConfig.defaultGcTime,
          retry: QUERY_RETRY_MAX,
          retryDelay: (attempt) =>
            Math.min(QUERY_RETRY_DELAY_BASE_MS * Math.pow(2, attempt), QUERY_RETRY_DELAY_MAX_MS),
          networkMode: OFFLINE_NETWORK_MODE,
          refetchOnWindowFocus: false,
          refetchOnReconnect: true,
        },
        mutations: {
          retry: QUERY_RETRY_MAX,
          networkMode: OFFLINE_NETWORK_MODE,
        },
      },
    });

    // Connect ConvexQueryClient to QueryClient for live updates
    convexQueryClient.connect(client);

    return client;
  };

  /**
   * Dispose all dependencies with proper cleanup
   *
   * - Mutex protected to prevent concurrent disposal
   * - Disposes in reverse order of initialization
   * - Safe to call multiple times
   */
  dispose = async (): Promise<void> => {
    const release = await this.disposeMutex.acquire();
    try {
      // Already disposed
      if (this.disposed) {
        return;
      }

      // Wait for initialization to complete if in progress
      if (this.initPromise) {
        try {
          await this.initPromise;
        } catch {
          // Ignore initialization errors during disposal
        }
      }

      // Nothing to dispose
      if (!this.deps) {
        this.disposed = true;
        return;
      }

      this.log('Disposing container');

      // Dispose in reverse order of initialization
      const { syncCoordinator, database, convexClient, convexQueryClient } = this.deps;

      // 1. Dispose sync coordinator
      try {
        await syncCoordinator.disposeAsync();
        this.log('Sync coordinator disposed');
      } catch (error) {
        this.logger.error('Error disposing sync coordinator:', error);
      }

      // 2. Shutdown analytics runtime if it was initialized
      if (this.analyticsRuntime?.duckdbRouter) {
        try {
          await this.analyticsRuntime.duckdbRouter.shutdown();
          this.log('DuckDB router shutdown');
        } catch (error) {
          this.logger.error('Error shutting down DuckDB router:', error);
        }
      }

      if (this.analyticsRuntime?.opfsManager) {
        try {
          await this.analyticsRuntime.opfsManager.dispose();
          this.log('OPFS manager disposed');
        } catch (error) {
          this.logger.error('Error disposing OPFS manager:', error);
        }
      }

      // 3. Stop cleanup and close database
      try {
        database.stopCleanup();
        database.close();
        this.log('Database closed');
      } catch (error) {
        this.logger.error('Error closing database:', error);
      }

      // 4. Close Convex clients (prevents WebSocket connection leaks)
      try {
        // Unsubscribe ConvexQueryClient from QueryCache events
        convexQueryClient.unsubscribe?.();
        // Close ConvexReactClient WebSocket connection
        convexClient.close();
        this.log('Convex clients closed');
      } catch (error) {
        this.logger.error('Error closing Convex clients:', error);
      }

      this.analyticsRuntime = null;
      this.deps = null;
      this.disposed = true;

      this.log('Container disposed');
    } finally {
      release();
    }
  };

  /**
   * Check if container is disposed
   */
  get isDisposed(): boolean {
    return this.disposed;
  }

  /**
   * Get dependencies (throws if not initialized or disposed)
   */
  getDependencies = (): DataLayerDependencies => {
    if (this.disposed) {
      throw new Error('[DataLayerContainer] Container is disposed');
    }
    if (!this.deps) {
      throw new Error('[DataLayerContainer] Container not initialized');
    }
    return this.deps;
  };

  /**
   * Check if container is initialized
   */
  get isInitialized(): boolean {
    return this.deps !== null && !this.disposed;
  }
}

/**
 * Create a new DataLayerContainer
 */
export const createDataLayerContainer = (config: ContainerConfig): DataLayerContainer =>
  new DataLayerContainer(config);
