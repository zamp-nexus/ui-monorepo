/**
 * Config Types
 *
 * Configuration types for QueryEngineProvider.
 *
 * @module types/config
 */

import type { FunctionReference } from 'convex/server';

// =============================================================================
// QUERY ENGINE CONFIG
// =============================================================================

/**
 * Configuration for QueryEngineProvider.
 *
 * Note: Most configuration is now in DataLayerConfig (unified table registry).
 * QueryEngineProvider only needs minimal additional config.
 */
export interface QueryEngineConfig {
  /**
   * DataSource API for fetching Parquet file metadata.
   *
   * This Convex query should return DataSourceResponse with:
   * - Table file URLs
   * - lastIngestedAt timestamps
   * - Schema information
   *
   * Required for DuckDB analytics path.
   */
  readonly dataSourceApi?: FunctionReference<'query'>;

  /**
   * Default stale time for queries (ms).
   * Overrides DataLayer's default if specified.
   *
   * Default: 6 hours (21600000 ms)
   */
  readonly defaultStaleTime?: number;

  /**
   * Whether to auto-refresh when newer data is detected.
   *
   * Default: false (show hasNewerData flag instead)
   */
  readonly autoRefreshOnUpdate?: boolean;

  /**
   * Background poll interval for checking data freshness (ms).
   * 0 = disabled (default)
   *
   * When enabled, periodically calls DataSource API to check lastIngestedAt.
   */
  readonly backgroundPollInterval?: number;

  /**
   * Enable debug logging.
   */
  readonly debug?: boolean;
}

// =============================================================================
// RESOLVED CONFIG
// =============================================================================

/**
 * Resolved configuration with defaults applied.
 */
export interface ResolvedQueryEngineConfig {
  /**
   * DataSource API reference (null if not configured).
   */
  readonly dataSourceApi: FunctionReference<'query'> | null;

  /**
   * Resolved stale time (ms).
   */
  readonly defaultStaleTime: number;

  /**
   * Whether to auto-refresh.
   */
  readonly autoRefreshOnUpdate: boolean;

  /**
   * Background poll interval (0 = disabled).
   */
  readonly backgroundPollInterval: number;

  /**
   * Debug mode enabled.
   */
  readonly debug: boolean;
}

// =============================================================================
// DEFAULTS
// =============================================================================

/**
 * Default stale time: 6 hours.
 */
export const DEFAULT_STALE_TIME = 6 * 60 * 60 * 1000;

/**
 * Default configuration values.
 */
export const DEFAULT_CONFIG: Omit<ResolvedQueryEngineConfig, 'dataSourceApi'> = {
  defaultStaleTime: DEFAULT_STALE_TIME,
  autoRefreshOnUpdate: false,
  backgroundPollInterval: 0,
  debug: false,
};

// =============================================================================
// UTILITIES
// =============================================================================

/**
 * Resolve configuration with defaults.
 */
export const resolveQueryEngineConfig = (
  config: QueryEngineConfig
): ResolvedQueryEngineConfig => ({
  dataSourceApi: config.dataSourceApi ?? null,
  defaultStaleTime: config.defaultStaleTime ?? DEFAULT_STALE_TIME,
  autoRefreshOnUpdate: config.autoRefreshOnUpdate ?? false,
  backgroundPollInterval: config.backgroundPollInterval ?? 0,
  debug: config.debug ?? false,
});
