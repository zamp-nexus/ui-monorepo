/**
 * Convex sync adapter
 * @module convex/adapter
 */

import type { ConvexReactClient } from 'convex/react';
import type { FunctionReference, FunctionArgs, FunctionReturnType } from 'convex/server';
import type { MutationQueueEntry } from '@open-insights-web/foundation-data-model';
import type { MutationExecutorResult } from '../queue/processor';
import {
  Disposable,
  CompositeDisposable,
  createDebugLogger,
  getErrorMessage,
  normalizeError,
  hashPayloadSync,
  SafeTimer,
} from '@open-insights-web/foundation-utils';
import { DEFAULT_SUBSCRIPTION_POLL_INTERVAL_MS } from '../core/defaults';

/**
 * Convex adapter configuration
 */
export interface ConvexAdapterConfig {
  /** Convex client instance */
  client: ConvexReactClient;
  /** Enable debug logging */
  debug?: boolean;
}

/**
 * Query options
 */
export interface ConvexQueryOptions<T> {
  /** Convex query function reference */
  query: FunctionReference<'query'>;
  /** Query arguments */
  args?: Record<string, unknown>;
  /** Transform function for the result */
  transform?: (data: unknown) => T;
}

/**
 * Mutation options
 */
export interface ConvexMutationOptions {
  /** Convex mutation function reference */
  mutation: FunctionReference<'mutation'>;
  /** Get arguments from mutation entry */
  getArgs: (entry: MutationQueueEntry) => Record<string, unknown>;
  /** Extract server ID from result */
  extractServerId?: (result: unknown) => string | undefined;
  /** Extract server data for conflict detection */
  extractServerData?: (result: unknown) => unknown;
}

/**
 * Subscription callbacks
 */
export interface SubscriptionCallbacks<T> {
  onUpdate: (data: T) => void;
  onError?: (error: Error) => void;
}

/**
 * Adaptive polling configuration.
 * When consecutive polls return unchanged data, the interval doubles
 * (up to MAX_POLL_INTERVAL_MULTIPLIER × base). On change, it resets.
 */
const UNCHANGED_POLLS_BEFORE_BACKOFF = 3;
const MAX_POLL_INTERVAL_MULTIPLIER = 4;

/**
 * Internal subscription state for managing poll functions and refresh
 */
interface SubscriptionState {
  /** Unsubscribe function */
  unsubscribe: () => void;
  /** Function to trigger immediate poll */
  poll: () => Promise<void>;
  /** Whether subscription is still active */
  isActive: boolean;
  /** SafeTimer for polling */
  pollTimer: SafeTimer | null;
  /** Consecutive unchanged poll count for adaptive backoff */
  unchangedCount: number;
  /** Current effective poll interval (adaptive) */
  currentInterval: number;
  /** Base poll interval configured for this subscription */
  baseInterval: number;
}

/**
 * Convex sync adapter with proper disposal
 */
export class ConvexSyncAdapter extends Disposable {
  private client: ConvexReactClient;
  private disposables = new CompositeDisposable();
  private subscriptions: Map<string, SubscriptionState> = new Map();
  private subscriptionIdCounter = 0;
  private logger;

  constructor(config: ConvexAdapterConfig) {
    super();
    this.client = config.client;
    this.logger = createDebugLogger('ConvexSyncAdapter', config.debug ?? false);
  }

  /**
   * Execute a Convex query
   */
  async query<Query extends FunctionReference<'query'>>(
    queryFn: Query,
    args?: FunctionArgs<Query>
  ): Promise<FunctionReturnType<Query>> {
    this.ensureNotDisposed();
    this.logger.debug('Executing query:', queryFn, args);

    try {
      // Use the Convex client to fetch query result
      const result = await this.client.query(queryFn, args ?? {});
      this.logger.debug('Query result:', result);
      return result;
    } catch (error) {
      this.logger.error('Query error:', error);
      throw error;
    }
  }

  /**
   * Execute a Convex mutation
   */
  async mutate<Mutation extends FunctionReference<'mutation'>>(
    mutationFn: Mutation,
    args?: FunctionArgs<Mutation>
  ): Promise<FunctionReturnType<Mutation>> {
    this.ensureNotDisposed();
    this.logger.debug('Executing mutation:', mutationFn, args);

    try {
      const result = await this.client.mutation(mutationFn, args ?? {});
      this.logger.debug('Mutation result:', result);
      return result;
    } catch (error) {
      this.logger.error('Mutation error:', error);
      throw error;
    }
  }

  /**
   * Create a mutation executor for the queue processor
   */
  createMutationExecutor(
    mutationMap: Record<string, ConvexMutationOptions>
  ): (entry: MutationQueueEntry) => Promise<MutationExecutorResult> {
    return async (entry: MutationQueueEntry): Promise<MutationExecutorResult> => {
      this.ensureNotDisposed();
      
      // Get mutation options for this table and type
      const key = `${entry.tableName}:${entry.type}`;
      const options = mutationMap[key];

      if (!options) {
        return {
          success: false,
          error: `No mutation configured for ${key}`,
        };
      }

      try {
        // Build arguments from entry
        const args = options.getArgs(entry);

        // Execute mutation
        const result = await this.mutate(options.mutation, args);

        // Extract server ID if applicable
        const serverId = options.extractServerId?.(result);
        
        // Extract server data for conflict detection
        const serverData = options.extractServerData?.(result);

        return {
          success: true,
          data: result,
          serverId,
          serverTimestamp: Date.now(),
          serverData,
        };
      } catch (error) {
        return {
          success: false,
          error: getErrorMessage(error),
        };
      }
    };
  }

  /**
   * Subscribe to a Convex query with polling-based updates using SafeTimer
   * 
   * NOTE: This method provides a subscription using polling since Convex's
   * real-time subscriptions are React-based (via hooks). For React components,
   * prefer using useQuery directly from convex/react for better performance.
   * This is intended for non-React contexts or manual subscription management.
   * 
   * @param queryFn - Convex query function reference
   * @param args - Query arguments
   * @param callbacks - Callbacks for updates and errors
   * @param pollInterval - Polling interval in ms (default: 5000)
   */
  subscribe<Query extends FunctionReference<'query'>>(
    queryFn: Query,
    args: FunctionArgs<Query>,
    callbacks: SubscriptionCallbacks<FunctionReturnType<Query>>,
    pollInterval = DEFAULT_SUBSCRIPTION_POLL_INTERVAL_MS
  ): () => void {
    this.ensureNotDisposed();

    const subscriptionId = `sub_${++this.subscriptionIdCounter}`;
    this.logger.debug('Subscribing to query with polling:', queryFn, args, 'id:', subscriptionId);

    let lastHash: string | undefined;

    // Create subscription state
    const state: SubscriptionState = {
      unsubscribe: () => undefined,
      poll: async () => undefined,
      isActive: true,
      pollTimer: null,
      unchangedCount: 0,
      currentInterval: pollInterval,
      baseInterval: pollInterval,
    };

    // Fetch and compare using structural hash (cheaper than full JSON comparison)
    const poll = async () => {
      if (!state.isActive || this.isDisposed) return;

      try {
        const result = await this.client.query(queryFn, args);

        if (state.isActive && !this.isDisposed) {
          const resultHash = hashPayloadSync(result);
          if (resultHash !== lastHash) {
            lastHash = resultHash;
            callbacks.onUpdate(result);
            // Data changed — reset adaptive backoff
            state.unchangedCount = 0;
            state.currentInterval = pollInterval;
          } else {
            // Data unchanged — increase backoff if threshold reached
            state.unchangedCount++;
            if (state.unchangedCount >= UNCHANGED_POLLS_BEFORE_BACKOFF) {
              const maxInterval = pollInterval * MAX_POLL_INTERVAL_MULTIPLIER;
              state.currentInterval = Math.min(state.currentInterval * 2, maxInterval);
            }
          }
        }
      } catch (error) {
        if (state.isActive && callbacks.onError) {
          callbacks.onError(normalizeError(error));
        }
      }
    };

    // Schedule next poll using SafeTimer with adaptive interval
    const scheduleNextPoll = () => {
      if (state.isActive && !this.isDisposed) {
        state.pollTimer?.dispose();

        state.pollTimer = new SafeTimer({
          delay: state.currentInterval,
          callback: async () => {
            await poll();
            scheduleNextPoll();
          },
          autoStart: true,
        });
      }
    };

    // Assign poll function to state
    state.poll = poll;

    // Create unsubscribe function
    const unsubscribe = () => {
      state.isActive = false;
      state.pollTimer?.dispose();
      state.pollTimer = null;
      this.subscriptions.delete(subscriptionId);
      this.logger.debug('Unsubscribed from query:', queryFn, 'id:', subscriptionId);
    };

    state.unsubscribe = unsubscribe;
    this.subscriptions.set(subscriptionId, state);

    // Initial fetch and start polling
    poll().then(() => {
      scheduleNextPoll();
    });

    return unsubscribe;
  }

  /**
   * Trigger an immediate refresh of all active subscriptions
   * Call this after mutations to ensure subscriptions get latest data faster
   */
  refreshSubscriptions(): void {
    if (this.isDisposed) return;
    
    const subscriptionCount = this.subscriptions.size;
    this.logger.debug('Refreshing', subscriptionCount, 'active subscriptions');
    
    if (subscriptionCount === 0) return;
    
    // Trigger immediate poll for all active subscriptions and reset adaptive backoff
    const pollPromises: Promise<void>[] = [];
    for (const [id, state] of this.subscriptions) {
      if (state.isActive) {
        // Reset backoff since a mutation likely changed the data
        state.unchangedCount = 0;
        state.currentInterval = state.baseInterval;
        this.logger.debug('Triggering refresh for subscription:', id);
        pollPromises.push(state.poll());
      }
    }
    
    // Wait for all polls to complete (fire-and-forget, but log errors)
    Promise.allSettled(pollPromises).then((results) => {
      const failed = results.filter(r => r.status === 'rejected');
      if (failed.length > 0) {
        this.logger.warn('Some subscription refreshes failed:', failed.length);
      }
    });
  }

  /**
   * Get the number of active subscriptions
   */
  getActiveSubscriptionCount(): number {
    return this.subscriptions.size;
  }

  /**
   * Dispose implementation
   */
  protected onDispose(): void {
    // Unsubscribe all active subscriptions (disposes their SafeTimers)
    for (const [id, state] of this.subscriptions) {
      try {
        // Explicitly mark as inactive first to prevent any pending polls
        // from scheduling more polls before unsubscribe completes
        state.isActive = false;
        // Dispose the SafeTimer explicitly
        state.pollTimer?.dispose();
        state.pollTimer = null;
        state.unsubscribe();
        this.logger.debug('Unsubscribed during dispose:', id);
      } catch (error) {
        this.logger.error('Error unsubscribing:', id, error);
      }
    }
    this.subscriptions.clear();
    this.disposables.dispose();
    this.logger.debug('Disposed');
  }
}

/**
 * Create Convex adapter instance
 */
export const createConvexAdapter = (config: ConvexAdapterConfig): ConvexSyncAdapter =>
  new ConvexSyncAdapter(config);
