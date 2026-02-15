/**
 * Data Layer Constants
 *
 * Centralized constants for the data layer library.
 * Uses TIME_MS from foundation-utils as the single source of truth for time constants.
 *
 * @module core/constants
 */

import { TIME_MS } from '@open-insights-web/foundation-utils';
import type { CacheConfig, ResolvedCacheConfig } from './types';

// =============================================================================
// Cache Configuration
// =============================================================================

/**
 * Default cache TTL for mutation entries (24 hours)
 *
 * Used for:
 * - Query cache entries created by mutations
 * - Optimistic update cache entries
 *
 * @see {@link DEFAULT_CACHE_CONFIG.defaultGcTime} for query cache GC time
 */
export const DEFAULT_CACHE_TTL = TIME_MS.DAY;

/**
 * Default cache configuration values
 *
 * These values are used when no explicit cache configuration is provided.
 *
 * @property defaultStaleTime - Time before data is considered stale (5 minutes)
 * @property defaultGcTime - Time before unused cache entries are garbage collected (24 hours)
 * @property analyticsStaleTime - Stale time for analytics queries (10 minutes)
 * @property analyticsGcTime - GC time for analytics queries (1 hour)
 */
export const DEFAULT_CACHE_CONFIG: ResolvedCacheConfig = {
  defaultStaleTime: TIME_MS.MINUTE * 5,
  defaultGcTime: TIME_MS.DAY,
  analyticsStaleTime: TIME_MS.MINUTE * 10,
  analyticsGcTime: TIME_MS.HOUR,
};

// =============================================================================
// Retry Configuration
// =============================================================================

/**
 * Default retry configuration for mutations and queries
 */
export const DEFAULT_RETRY_CONFIG = {
  /** Maximum number of retry attempts */
  maxRetries: 3,
  /** Base delay between retries in milliseconds */
  baseDelayMs: TIME_MS.SECOND,
  /** Maximum delay between retries in milliseconds */
  maxDelayMs: TIME_MS.SECOND * 30,
} as const;

/**
 * Default retry attempts for TanStack queries.
 */
export const QUERY_RETRY_MAX = DEFAULT_RETRY_CONFIG.maxRetries;

/**
 * Default base retry delay for TanStack queries.
 */
export const QUERY_RETRY_DELAY_BASE_MS = DEFAULT_RETRY_CONFIG.baseDelayMs;

/**
 * Default max retry delay for TanStack queries.
 */
export const QUERY_RETRY_DELAY_MAX_MS = DEFAULT_RETRY_CONFIG.maxDelayMs;

/**
 * Default TanStack network mode for offline-first behavior.
 */
export const OFFLINE_NETWORK_MODE = 'offlineFirst' as const;

/**
 * Retry attempts for analytics SQL queries.
 */
export const ANALYTICS_QUERY_RETRY_MAX = 2;

/**
 * Supported table operations.
 */
export const TABLE_OPERATION = {
  LIST: 'list',
  GET: 'get',
  CREATE: 'create',
  UPDATE: 'update',
  DELETE: 'delete',
} as const;

export type TableOperation = (typeof TABLE_OPERATION)[keyof typeof TABLE_OPERATION];

/**
 * Conflict resolution discriminant values.
 */
export const CONFLICT_RESOLUTION_TYPE = {
  ACCEPT_LOCAL: 'accept-local',
  ACCEPT_REMOTE: 'accept-remote',
  MERGE: 'merge',
} as const;

export type ConflictResolutionType =
  (typeof CONFLICT_RESOLUTION_TYPE)[keyof typeof CONFLICT_RESOLUTION_TYPE];

// =============================================================================
// Cache Config Resolution
// =============================================================================

/**
 * Resolve cache config with defaults
 *
 * Merges user-provided cache configuration with default values.
 * Any unspecified values will use the defaults.
 *
 * @param config - Optional user cache configuration
 * @returns Fully resolved cache configuration with all values defined
 */
export const resolveCacheConfig = (config?: CacheConfig): ResolvedCacheConfig => ({
  defaultStaleTime: config?.defaultStaleTime ?? DEFAULT_CACHE_CONFIG.defaultStaleTime,
  defaultGcTime: config?.defaultGcTime ?? DEFAULT_CACHE_CONFIG.defaultGcTime,
  analyticsStaleTime: config?.analyticsStaleTime ?? DEFAULT_CACHE_CONFIG.analyticsStaleTime,
  analyticsGcTime: config?.analyticsGcTime ?? DEFAULT_CACHE_CONFIG.analyticsGcTime,
});
