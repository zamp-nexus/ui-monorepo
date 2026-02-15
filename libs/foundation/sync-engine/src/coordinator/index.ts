/**
 * Sync Coordinator - Main orchestrator for offline-first sync
 * @module coordinator
 */

import type { QueryClient } from '@tanstack/react-query';
import type { ConvexReactClient } from 'convex/react';
import type { InsightsDatabase } from '@open-insights-web/foundation-database';
import { getDatabase } from '@open-insights-web/foundation-database';
import {
  CROSS_TAB_MESSAGE_TYPE,
  SYNC_EVENT_TYPE,
  type QueryKeyBase,
  type SyncState,
  type ProcessingResult,
  type ConflictStrategy,
  type NetworkStatus,
  type SyncEvent,
  type SyncEventListener,
} from '@open-insights-web/foundation-data-model';
import {
  AsyncDisposable,
  CompositeDisposable,
  createDebugLogger,
  createSingletonFactory,
  Mutex,
  normalizeError,
  SafeDebounce,
  SafeTimer,
} from '@open-insights-web/foundation-utils';
import type { NetworkStatusMonitor } from '../network/index';
import { createNetworkMonitor } from '../network/index';
import type { OfflineQueueManager } from '../queue/manager';
import { createQueueManager } from '../queue/manager';
import { QueueProcessor } from '../queue/processor';
import type { ConflictResolver } from '../conflicts/resolver';
import { createConflictResolver } from '../conflicts/resolver';
import type { ConvexSyncAdapter } from '../convex/adapter';
import { createConvexAdapter, type ConvexMutationOptions } from '../convex/adapter';
import type { CrossTabManager } from '../cross-tab/manager';
import { createCrossTabManager } from '../cross-tab/manager';
import type { ISyncCoordinator, INetworkMonitor, IQueueManager, IConflictResolver } from '../core/interfaces';
import {
  DEFAULT_AUTO_START,
  DEFAULT_CONFLICT_STRATEGY,
  DEFAULT_ENABLE_CROSS_TAB,
  DEFAULT_SYNC_DEBOUNCE_DELAY_MS,
} from '../core/defaults';

/**
 * Sync coordinator configuration
 */
export interface SyncCoordinatorConfig {
  /** TanStack Query client */
  queryClient: QueryClient;
  /** Convex client */
  convexClient: ConvexReactClient;
  /** Database instance */
  database?: InsightsDatabase;
  /** Conflict resolution strategy */
  conflictStrategy?: ConflictStrategy;
  /** Mutation map for queue processing */
  mutationMap?: Record<string, ConvexMutationOptions>;
  /** Auto-start on creation */
  autoStart?: boolean;
  /** Enable cross-tab sync */
  enableCrossTab?: boolean;
  /** Health check URL */
  healthCheckUrl?: string;
  /** Health check interval */
  healthCheckInterval?: number;
  /** Enable debug logging */
  debug?: boolean;
  /** Error callback for centralized error handling */
  onError?: (error: Error, context?: string) => void;
}

// NOTE: SyncEventType, SyncEvent, SyncEventListener, and SyncState are now in @foundation/data-model
// Import them from there for consistency across the codebase

/**
 * Default configuration
 */
const DEFAULT_CONFIG = {
  conflictStrategy: DEFAULT_CONFLICT_STRATEGY,
  enableCrossTab: DEFAULT_ENABLE_CROSS_TAB,
  debug: false,
};

/**
 * Debounce delay for sync requests (ms)
 * Prevents rapid-fire sync calls from overwhelming the system
 */
const SYNC_DEBOUNCE_DELAY_MS = DEFAULT_SYNC_DEBOUNCE_DELAY_MS;

/**
 * Sync Coordinator - Orchestrates offline-first data synchronization
 * with proper disposal, mutex protection, and error handling
 */
export class SyncCoordinator extends AsyncDisposable implements ISyncCoordinator {
  private queryClient: QueryClient;
  private convexAdapter: ConvexSyncAdapter;
  private db: InsightsDatabase;
  private networkMonitor: NetworkStatusMonitor;
  private queueManager: OfflineQueueManager;
  private queueProcessor: QueueProcessor | null = null;
  private conflictResolver: ConflictResolver;
  private crossTabManager: CrossTabManager | null = null;

  private config: SyncCoordinatorConfig & typeof DEFAULT_CONFIG;
  private listeners: Set<SyncEventListener> = new Set();
  private started = false;
  private lastSyncAt: number | null = null;
  
  // Mutex for sync operations to prevent race conditions
  private syncMutex = new Mutex();

  // Sync scheduling with SafeDebounce for proper cleanup
  private syncDebounce: SafeDebounce<[]> | null = null;
  private pendingSyncRequest = false;
  private pendingSyncTimer: SafeTimer | null = null;

  // Disposables for cleanup
  private runtimeDisposables: CompositeDisposable | null = null;
  private logger;

  constructor(config: SyncCoordinatorConfig) {
    super();
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.queryClient = config.queryClient;
    this.db = config.database ?? getDatabase();
    this.logger = createDebugLogger('SyncCoordinator', this.config.debug);

    // Initialize components
    this.convexAdapter = createConvexAdapter({
      client: config.convexClient,
      debug: this.config.debug,
    });

    this.networkMonitor = createNetworkMonitor({
      database: this.db,
      healthCheckUrl: config.healthCheckUrl,
      healthCheckInterval: config.healthCheckInterval,
      debug: this.config.debug,
    });

    this.queueManager = createQueueManager({
      database: this.db,
      debug: this.config.debug,
    });

    this.conflictResolver = createConflictResolver({
      defaultStrategy: this.config.conflictStrategy,
      debug: this.config.debug,
    });

    if (this.config.enableCrossTab) {
      this.crossTabManager = createCrossTabManager({
        debug: this.config.debug,
      });
    }

    // Initialize queue processor if mutation map provided
    if (config.mutationMap) {
      this.queueProcessor = new QueueProcessor({
        queueManager: this.queueManager,
        conflictResolver: this.conflictResolver,
        executor: this.convexAdapter.createMutationExecutor(config.mutationMap),
        onSuccess: (mutation, result) => {
          this.logger.debug('Mutation succeeded:', mutation.id);
          // Invalidate related queries
          if (mutation.invalidateKeys) {
            for (const keyStr of mutation.invalidateKeys) {
              try {
                const key = JSON.parse(keyStr);
                this.queryClient.invalidateQueries({ queryKey: key });
              } catch {
                // Ignore parse errors
              }
            }
          }
        },
        onFailure: (mutation, error) => {
          this.logger.warn('Mutation failed:', mutation.id, error);
        },
        onConflict: (mutation, context) => {
          this.logger.debug('Conflict detected:', mutation.id);
          this.emit({
            type: SYNC_EVENT_TYPE.CONFLICT_DETECTED,
            timestamp: Date.now(),
            data: { conflictCount: 1 },
          });
        },
        onError: (error, mutation) => {
          this.handleError(error, mutation ? `Mutation ${mutation.id}` : 'Queue processing');
        },
        debug: this.config.debug,
      });
    }

    // Constructor has no side effects. Use createAndStartSyncCoordinator()
    // or createSyncCoordinator({ autoStart: true }) to start automatically.
  }

  /**
   * Handle errors with optional callback
   */
  private handleError(error: unknown, context?: string): void {
    const err = normalizeError(error);
    this.logger.error(`Error in ${context ?? 'unknown'}:`, err);
    this.config.onError?.(err, context);
  }

  /**
   * Get current sync state
   */
  async getState(): Promise<SyncState> {
    this.ensureNotDisposed();
    const stats = await this.queueManager.getStats();

    return {
      isOnline: this.networkMonitor.isOnline,
      isSyncing: this.syncMutex.isLocked,
      lastSyncAt: this.lastSyncAt,
      pendingMutations: stats.pending + stats.offlineQueued,
      failedMutations: stats.failed,
      isLeader: this.crossTabManager?.isLeader ?? true, // Default to true if no cross-tab
    };
  }

  /**
   * Start the sync coordinator
   */
  async start(): Promise<void> {
    this.ensureNotDisposed();
    if (this.started) return;
    this.started = true;
    this.runtimeDisposables = new CompositeDisposable();

    this.logger.debug('Starting sync coordinator');

    // Start network monitor
    await this.networkMonitor.start();

    // Subscribe to network status changes
    const networkUnsubscribe = this.networkMonitor.subscribe(
      this.handleNetworkStatusChange
    );
    this.runtimeDisposables.addFunction(networkUnsubscribe);

    // Start cross-tab sync
    if (this.crossTabManager) {
      this.crossTabManager.start();
      this.setupCrossTabHandlers(this.runtimeDisposables);
    }

    // Initial sync if online
    if (this.networkMonitor.isOnline) {
      await this.sync().catch((error) => {
        this.handleError(error, 'Initial sync');
      });
    }

    this.logger.debug('Sync coordinator started');
  }

  /**
   * Stop the sync coordinator
   */
  stop(): void {
    if (!this.started) return;
    this.started = false;

    this.logger.debug('Stopping sync coordinator');

    // Stop network monitor
    this.networkMonitor.stop();

    // Stop cross-tab manager
    this.crossTabManager?.stop();

    // Stop queue processor if running
    this.queueProcessor?.stop();

    if (this.syncDebounce) {
      this.syncDebounce.cancel();
    }
    if (this.pendingSyncTimer) {
      this.pendingSyncTimer.dispose();
      this.pendingSyncTimer = null;
    }
    this.pendingSyncRequest = false;

    this.runtimeDisposables?.dispose();
    this.runtimeDisposables = null;

    this.logger.debug('Sync coordinator stopped');
  }

  /**
   * Schedule a debounced sync to prevent rapid-fire sync calls.
   * If a sync is already in progress, schedules another sync for when it completes.
   * Multiple calls while a sync is pending are coalesced into a single sync.
   *
   * Uses SafeDebounce for proper timer cleanup.
   */
  scheduleSync(): void {
    if (this.isDisposed) return;

    // If already have a pending request, don't schedule another
    if (this.pendingSyncRequest) {
      this.logger.debug('Sync already scheduled, coalescing request');
      return;
    }

    // Create debounce instance if needed
    if (!this.syncDebounce) {
      this.syncDebounce = new SafeDebounce({
        delay: SYNC_DEBOUNCE_DELAY_MS,
        callback: () => {
          this.pendingSyncRequest = false;

          if (this.isDisposed) return;

          this.sync().catch((error) => {
            this.handleError(error, 'Scheduled sync');
          });
        },
        debug: this.config.debug,
      });
    }

    // Mark that we have a pending request and trigger the debounce
    this.pendingSyncRequest = true;
    this.syncDebounce.call();
  }

  /**
   * Trigger a sync (flush queue) with mutex protection.
   * Uses queue-based scheduling to ensure sync requests are not lost.
   */
  async sync(): Promise<ProcessingResult | null> {
    this.ensureNotDisposed();
    
    // Try to acquire lock - if already syncing, schedule for later
    const release = this.syncMutex.tryAcquire();
    if (!release) {
      this.logger.debug('Already syncing, scheduling follow-up sync');
      // Don't lose the sync request - schedule it for when current sync completes
      this.pendingSyncRequest = true;
      return null;
    }

    try {
      if (!this.networkMonitor.isOnline) {
        this.logger.debug('Offline, skipping sync');
        return null;
      }

      if (!this.queueProcessor) {
        this.logger.debug('No queue processor configured');
        return null;
      }

      this.emit({ type: SYNC_EVENT_TYPE.SYNC_START, timestamp: Date.now() });
      this.crossTabManager?.notifySyncStarted();

      // Mark offline-queued mutations as pending
      await this.queueManager.markAllPending();

      // Process the queue
      const result = await this.queueProcessor.process();

      this.lastSyncAt = Date.now();

      this.emit({
        type: SYNC_EVENT_TYPE.SYNC_COMPLETE,
        timestamp: Date.now(),
        data: {
          queueResult: result,
          idMappings: result.idMappings,
        },
      });

      this.crossTabManager?.notifySyncCompleted();

      this.logger.debug('Sync complete:', result);
      return result;
    } catch (error) {
      this.emit({
        type: SYNC_EVENT_TYPE.SYNC_ERROR,
        timestamp: Date.now(),
        data: { error: normalizeError(error) },
      });

      this.handleError(error, 'Sync');
      throw error;
    } finally {
      release();

      // Check if there's a pending sync request that was scheduled while we were syncing
      if (this.pendingSyncRequest && !this.isDisposed) {
        this.pendingSyncRequest = false;
        this.logger.debug('Processing pending sync request');

        // Dispose any existing pending sync timer
        if (this.pendingSyncTimer) {
          this.pendingSyncTimer.dispose();
          this.pendingSyncTimer = null;
        }

        // Use SafeTimer with immediate execution to avoid stack overflow on rapid calls
        this.pendingSyncTimer = new SafeTimer({
          delay: 0,
          callback: () => {
            this.pendingSyncTimer = null;
            if (!this.isDisposed && this.networkMonitor.isOnline) {
              this.sync().catch((error) => {
                this.handleError(error, 'Pending sync');
              });
            }
          },
          debug: this.config.debug,
          autoStart: true,
        });
      }
    }
  }

  /**
   * Subscribe to sync events
   */
  subscribe(listener: SyncEventListener): () => void {
    this.ensureNotDisposed();
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /**
   * Invalidate queries and notify other tabs
   */
  invalidateQueries(queryKeys: QueryKeyBase[]): void {
    this.ensureNotDisposed();
    for (const key of queryKeys) {
      this.queryClient.invalidateQueries({ queryKey: key });
    }
    this.crossTabManager?.invalidateQueries(queryKeys);
  }

  /**
   * Get network monitor instance
   */
  getNetworkMonitor(): INetworkMonitor {
    return this.networkMonitor;
  }

  /**
   * Get queue manager instance
   */
  getQueueManager(): IQueueManager {
    return this.queueManager;
  }

  /**
   * Get conflict resolver instance
   */
  getConflictResolver(): IConflictResolver {
    return this.conflictResolver;
  }

  /**
   * Get Convex adapter instance
   */
  getConvexAdapter(): ConvexSyncAdapter {
    return this.convexAdapter;
  }

  /**
   * Async dispose implementation
   */
  protected async onDisposeAsync(): Promise<void> {
    this.stop();

    // Dispose any pending sync timers
    if (this.syncDebounce) {
      this.syncDebounce.dispose();
      this.syncDebounce = null;
    }
    if (this.pendingSyncTimer) {
      this.pendingSyncTimer.dispose();
      this.pendingSyncTimer = null;
    }
    this.pendingSyncRequest = false;

    this.listeners.clear();
    this.runtimeDisposables = null;

    // Dispose child components
    await this.networkMonitor.disposeAsync();
    this.queueManager.dispose();
    this.conflictResolver.dispose();
    this.crossTabManager?.dispose();
    this.queueProcessor?.dispose();
    this.convexAdapter.dispose();

    this.logger.debug('Disposed');
  }

  /**
   * Handle network status changes with error boundaries
   */
  private handleNetworkStatusChange = (status: NetworkStatus | { isOnline: boolean }): void => {
    if (this.isDisposed) return;
    
    if (status.isOnline) {
      this.logger.debug('Network online');
      this.emit({ type: SYNC_EVENT_TYPE.ONLINE, timestamp: Date.now() });
      this.crossTabManager?.notifyOnline();

      // Only sync if we're the leader (or no cross-tab)
      const shouldSync = !this.crossTabManager || this.crossTabManager.isLeader;
      if (shouldSync) {
        // Use debounced sync to prevent rapid-fire syncs during network flapping
        this.scheduleSync();
      }
    } else {
      this.logger.debug('Network offline');
      this.emit({ type: SYNC_EVENT_TYPE.OFFLINE, timestamp: Date.now() });
      this.crossTabManager?.notifyOffline();

      // Cancel any pending sync since we're now offline
      if (this.syncDebounce) {
        this.syncDebounce.cancel();
      }
      this.pendingSyncRequest = false;

      // Mark pending mutations as offline-queued
      this.queueManager.markAllOfflineQueued().catch((error) => {
        this.handleError(error, 'Mark offline queued');
      });

      // NOTE: Do NOT mutate global TanStack Query defaults here.
      // Per-query networkMode is already set to 'offlineFirst' in the
      // DataLayerContainer's QueryClient defaults. Mutating global defaults
      // here would affect ALL queries (including non-data-layer ones) and
      // the change was never reversed when going back online.
    }
  };

  /**
   * Set up cross-tab event handlers
   */
  private setupCrossTabHandlers(disposables: CompositeDisposable): void {
    if (!this.crossTabManager) return;

    // Handle invalidation from other tabs
    const invalidateUnsub = this.crossTabManager.subscribe(CROSS_TAB_MESSAGE_TYPE.INVALIDATE, (message) => {
      if (message.payload?.queryKeys) {
        for (const key of message.payload.queryKeys) {
          if (Array.isArray(key)) {
            this.queryClient.invalidateQueries({ queryKey: key });
          }
        }
      }
    });
    disposables.addFunction(invalidateUnsub);

    // Handle mutation completion from other tabs
    const mutationUnsub = this.crossTabManager.subscribe(CROSS_TAB_MESSAGE_TYPE.MUTATION_COMPLETED, (message) => {
      if (message.payload?.tableName) {
        // Invalidate queries for the affected table
        this.queryClient.invalidateQueries({
          queryKey: [message.payload.tableName],
        });
      }
    });
    disposables.addFunction(mutationUnsub);

    // Handle online status from other tabs
    const onlineUnsub = this.crossTabManager.subscribe(CROSS_TAB_MESSAGE_TYPE.ONLINE, () => {
      // Another tab detected we're online, verify and sync if we're leader
      if (!this.crossTabManager?.isLeader) return;
      
      this.networkMonitor.checkConnectivity().then((isOnline) => {
        if (isOnline) {
          // Use debounced sync to prevent thundering herd from multiple tabs
          this.scheduleSync();
        }
      }).catch((error) => {
        this.handleError(error, 'Cross-tab connectivity check');
      });
    });
    disposables.addFunction(onlineUnsub);

    // Handle leader election - emit leader-changed event and sync if we became leader
    const leaderUnsub = this.crossTabManager.subscribe(CROSS_TAB_MESSAGE_TYPE.LEADER_ELECTED, (message) => {
      const isNowLeader = message.payload?.leaderId === this.crossTabManager?.id;
      
      // Emit leader-changed event for consumers
      this.emit({
        type: SYNC_EVENT_TYPE.LEADER_CHANGED,
        timestamp: Date.now(),
        data: { isLeader: isNowLeader },
      });
      
      if (isNowLeader) {
        this.logger.debug('This tab became leader, scheduling sync');
        // Use debounced sync when becoming leader
        this.scheduleSync();
      }
    });
    disposables.addFunction(leaderUnsub);
  }

  /**
   * Emit a sync event
   */
  private emit(event: SyncEvent): void {
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch (error) {
        this.handleError(error, 'Event listener');
      }
    }
  }
}

/**
 * Create a sync coordinator instance.
 * By default this starts synchronization unless `autoStart` is explicitly `false`.
 *
 * @param config - Sync coordinator configuration
 * @returns SyncCoordinator instance
 */
export const createSyncCoordinator = (config: SyncCoordinatorConfig): SyncCoordinator => {
  const coordinator = new SyncCoordinator(config);
  const shouldAutoStart = config.autoStart ?? DEFAULT_AUTO_START;

  if (shouldAutoStart) {
    void coordinator.start().catch((error) => {
      const normalizedError = normalizeError(error);
      if (config.onError) {
        config.onError(normalizedError, 'createSyncCoordinator.autoStart');
        return;
      }
      console.error('[SyncCoordinator] Auto-start failed:', normalizedError);
    });
  }

  return coordinator;
};

/**
 * Create and start a sync coordinator instance.
 * This is the recommended way to create a coordinator when autoStart is desired.
 *
 * This function always starts the coordinator regardless of `autoStart`.
 *
 * @param config - Sync coordinator configuration
 * @returns Promise resolving to started SyncCoordinator instance
 */
export const createAndStartSyncCoordinator = async (config: SyncCoordinatorConfig): Promise<SyncCoordinator> => {
  const coordinator = new SyncCoordinator(config);
  await coordinator.start();
  return coordinator;
};

/**
 * Singleton factory for sync coordinator
 */
const syncCoordinatorFactory = createSingletonFactory(
  (config: SyncCoordinatorConfig) => new SyncCoordinator(config),
  {
    name: 'SyncCoordinator',
    onDispose: async (instance) => {
      if (instance instanceof SyncCoordinator) {
        await instance.disposeAsync();
      }
    },
  }
);

/**
 * Get or create sync coordinator singleton instance.
 */
export const getSyncCoordinator = (config: SyncCoordinatorConfig): SyncCoordinator =>
  syncCoordinatorFactory.getInstance(config);

/**
 * Reset sync coordinator singleton (for testing).
 */
export const resetSyncCoordinator = (): void => {
  void syncCoordinatorFactory.reset();
};
