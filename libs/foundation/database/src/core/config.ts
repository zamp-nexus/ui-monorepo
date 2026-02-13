/**
 * Database configuration
 * @module core/config
 */

import { TIME_MS } from '@open-insights-web/foundation-utils';

/**
 * Database configuration options
 */
export interface DatabaseConfig {
  /** Database name */
  name: string;
  /** Database version */
  version: number;
  /** Enable debug logging */
  debug: boolean;
  /** Query cache TTL in milliseconds (default: 5 minutes) */
  queryCacheTTL: number;
  /** Mutation queue max retry attempts */
  maxRetryAttempts: number;
  /** Stale data threshold in milliseconds */
  staleThreshold: number;
  /** Enable auto cleanup of expired data */
  autoCleanup: boolean;
  /** Cleanup interval in milliseconds */
  cleanupInterval: number;
  /** Maximum number of cache entries before LRU eviction (0 = no limit) */
  maxCacheEntries: number;
}

// =============================================================================
// Environment Detection (Early Return Pattern)
// =============================================================================

/**
 * Check if running in development environment
 * Uses early returns for clarity and safety in browser environments
 */
const isDevelopment = (): boolean => {
  if (typeof process === 'undefined') return false;
  if (!process.env) return false;
  return process.env.NODE_ENV === 'development';
};

/**
 * Default database configuration
 */
export const DEFAULT_DATABASE_CONFIG: DatabaseConfig = {
  name: 'open-insights-db',
  version: 1,
  debug: isDevelopment(),
  queryCacheTTL: TIME_MS.MINUTE * 5, // 5 minutes
  maxRetryAttempts: 3,
  staleThreshold: TIME_MS.MINUTE, // 1 minute
  autoCleanup: true,
  cleanupInterval: TIME_MS.MINUTE, // 1 minute
  maxCacheEntries: 1000, // Maximum cache entries before LRU eviction
};

/**
 * Merge user config with defaults
 */
export const mergeConfig = (
  userConfig: Partial<DatabaseConfig> = {}
): DatabaseConfig => ({
  ...DEFAULT_DATABASE_CONFIG,
  ...userConfig,
});

/**
 * Query cache entry status constants
 */
export const QueryCacheStatus = {
  FRESH: 'fresh',
  STALE: 'stale',
  EXPIRED: 'expired',
} as const;

export type QueryCacheStatus = (typeof QueryCacheStatus)[keyof typeof QueryCacheStatus];

/**
 * Mutation queue status constants
 */
export const MutationStatus = {
  PENDING: 'pending',
  IN_PROGRESS: 'in_progress',
  COMPLETED: 'completed',
  FAILED: 'failed',
  OFFLINE_QUEUED: 'offline_queued',
} as const;

export type MutationStatus = (typeof MutationStatus)[keyof typeof MutationStatus];

/**
 * Sync state keys
 */
export const SYNC_STATE_KEYS = {
  LAST_SYNC: 'lastSync',
  NETWORK_STATUS: 'networkStatus',
  PENDING_COUNT: 'pendingCount',
  DUCKDB_VIEWS: 'duckdbViews',
  SCHEMA_VERSION: 'schemaVersion',
  CONFLICTS: 'conflicts',
  ID_MAPPINGS: 'idMappings',
} as const;

export type SyncStateKey = typeof SYNC_STATE_KEYS[keyof typeof SYNC_STATE_KEYS];
