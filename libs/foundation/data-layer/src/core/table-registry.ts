/**
 * Unified Table Registry
 *
 * Single source of truth for table metadata used across:
 * - DataLayer (Convex API calls, caching)
 * - SyncEngine (conflict resolution, offline sync)
 * - QueryEngine (routing decisions, analytics)
 *
 * Tables are defined ONCE in DataLayerConfig and accessed via this registry.
 *
 * @module core/table-registry
 */

import type { FunctionReference } from 'convex/server';
import { ConflictStrategy } from '@open-insights-web/foundation-data-model';
import { TIME_MS, createDebugLogger, type Logger } from '@open-insights-web/foundation-utils';

// =============================================================================
// DATA FRESHNESS CONSTANTS
// =============================================================================

/**
 * Data freshness level values for analytics queries.
 * Controls when DuckDB is used vs Convex API.
 *
 * These are the actual string values stored in configuration.
 */
export const DATA_FRESHNESS = {
  /** Always use API (no DuckDB) */
  REALTIME: 'REALTIME',
  /** Prefer API, use DuckDB for complex queries */
  NEAR_REALTIME: 'NEAR_REALTIME',
  /** Prefer DuckDB, API only for mutations */
  EVENTUAL: 'EVENTUAL',
} as const;

/**
 * Data freshness level type.
 *
 * @example
 * ```ts
 * // Use constant value
 * const freshness = DATA_FRESHNESS.NEAR_REALTIME;
 *
 * // Use as type
 * const config: { freshness: DataFreshnessLevel } = {
 *   freshness: DATA_FRESHNESS.REALTIME
 * };
 * ```
 */
export type DataFreshnessLevel = (typeof DATA_FRESHNESS)[keyof typeof DATA_FRESHNESS];

// =============================================================================
// UNIFIED TABLE CONFIG
// =============================================================================

/**
 * Analytics configuration for a table.
 * Controls DuckDB/Parquet behavior for complex queries.
 */
export interface TableAnalyticsConfig {
  /**
   * Whether analytics (DuckDB) is enabled for this table.
   * If false, all queries use Convex API only.
   */
  readonly enabled: boolean;

  /**
   * Data freshness requirement.
   * @see DATA_FRESHNESS for available values
   */
  readonly freshness?: DataFreshnessLevel;

  /**
   * Stale time for analytics data (ms).
   * Analytics can have longer stale times than transactional queries.
   */
  readonly staleTime?: number;
}

/**
 * Unified table configuration - single source of truth.
 *
 * Combines all table metadata previously scattered across:
 * - DataLayer mutationMap
 * - SyncEngine tableStrategies/tableMergeConfigs
 * - QueryEngine SchemaRegistry
 *
 * @example
 * {
 *   name: 'users',
 *   convex: {
 *     list: api.users.list,
 *     get: api.users.get,
 *     create: api.users.create,
 *     update: api.users.update,
 *     delete: api.users.delete,
 *   },
 *   staleTime: 5 * 60 * 1000,
 *   conflictStrategy: ConflictStrategy.LAST_WRITE_WINS,
 *   analytics: {
 *     enabled: true,
 *     freshness: DATA_FRESHNESS.NEAR_REALTIME,
 *   },
 * }
 */
export interface UnifiedTableConfig {
  /**
   * Table name (unique identifier).
   * Used as key in all registries and for query routing.
   */
  readonly name: string;

  // ─── CONVEX API REFERENCES ──────────────────────────────────────────────────

  /**
   * Convex function references for this table.
   * Used by DataLayer for API calls and SyncEngine for offline mutations.
   */
  readonly convex?: {
    /** List/query function for fetching multiple records */
    readonly list?: FunctionReference<'query'>;
    /** Get function for fetching a single record by ID */
    readonly get?: FunctionReference<'query'>;
    /** Create mutation for inserting new records */
    readonly create?: FunctionReference<'mutation'>;
    /** Update mutation for modifying existing records */
    readonly update?: FunctionReference<'mutation'>;
    /** Delete mutation for removing records */
    readonly delete?: FunctionReference<'mutation'>;
  };

  // ─── CACHE CONFIGURATION ────────────────────────────────────────────────────

  /**
   * Stale time override for this table (ms).
   * After this time, data is considered stale and may be refetched.
   * If not set, uses global defaultStaleTime.
   */
  readonly staleTime?: number;

  /**
   * GC time override for this table (ms).
   * Unused cache entries are garbage collected after this time.
   * If not set, uses global defaultGcTime.
   */
  readonly gcTime?: number;

  // ─── CONFLICT RESOLUTION ────────────────────────────────────────────────────

  /**
   * Conflict resolution strategy for this table.
   * Used by SyncEngine when offline mutations conflict with server state.
   *
   * @see ConflictStrategy from foundation-data-model
   */
  readonly conflictStrategy?: ConflictStrategy;

  /**
   * Merge configuration for 'merge' conflict strategy.
   * Defines field-level merge rules.
   */
  readonly mergeConfig?: {
    /** Fields that always use server value */
    readonly serverFields?: ReadonlyArray<string>;
    /** Fields that always use client value */
    readonly clientFields?: ReadonlyArray<string>;
    /** Fields to deep merge (for nested objects) */
    readonly deepMergeFields?: ReadonlyArray<string>;
    /** Custom merge function */
    readonly customMerge?: (
      serverValue: unknown,
      clientValue: unknown,
      field: string
    ) => unknown;
  };

  // ─── ANALYTICS CONFIGURATION ────────────────────────────────────────────────

  /**
   * Analytics (DuckDB) configuration for this table.
   * Controls when DuckDB is used vs Convex API.
   */
  readonly analytics?: TableAnalyticsConfig;
}

// =============================================================================
// TABLE REGISTRY
// =============================================================================

/**
 * TableRegistry - centralized access to table configurations.
 *
 * Provides typed accessors for different use cases:
 * - DataLayer hooks: getConvexRef, getStaleTime
 * - SyncEngine: getConflictStrategy, getMergeConfig
 * - QueryEngine: isAnalyticsEnabled, getAnalyticsFreshness
 */
export class TableRegistry {
  private readonly tables = new Map<string, UnifiedTableConfig>();
  private readonly defaults: {
    readonly staleTime: number;
    readonly gcTime: number;
    readonly conflictStrategy: ConflictStrategy;
  };
  private readonly logger: Logger;

  constructor(
    tables: ReadonlyArray<UnifiedTableConfig> = [],
    defaults: {
      staleTime?: number;
      gcTime?: number;
      conflictStrategy?: ConflictStrategy;
      debug?: boolean;
    } = {}
  ) {
    this.logger = createDebugLogger('TableRegistry', defaults.debug ?? false);
    this.defaults = {
      staleTime: defaults.staleTime ?? TIME_MS.MINUTE * 5,
      gcTime: defaults.gcTime ?? TIME_MS.DAY,
      conflictStrategy: defaults.conflictStrategy ?? ConflictStrategy.LAST_WRITE_WINS,
    };

    // Check for duplicate table names in initialization
    const seenNames = new Set<string>();
    for (const table of tables) {
      if (seenNames.has(table.name)) {
        this.logger.warn(
          `Duplicate table name '${table.name}' in initialization.`,
          'Only the last configuration will be used.'
        );
      }
      seenNames.add(table.name);
      this.tables.set(table.name, table);
    }
  }

  // ─── BASIC ACCESSORS ────────────────────────────────────────────────────────

  /**
   * Get table configuration by name.
   * Returns undefined if table not registered.
   */
  getTable = (name: string): UnifiedTableConfig | undefined => this.tables.get(name);

  /**
   * Get table configuration by name, throwing if not found.
   */
  getTableOrThrow = (name: string): UnifiedTableConfig => {
    const table = this.tables.get(name);
    if (!table) {
      throw new Error(`[TableRegistry] Table '${name}' not registered`);
    }
    return table;
  };

  /**
   * Check if table is registered.
   */
  hasTable = (name: string): boolean => this.tables.has(name);

  /**
   * Get all registered tables.
   */
  getAllTables = (): ReadonlyArray<UnifiedTableConfig> => Array.from(this.tables.values());

  /**
   * Get all registered table names.
   */
  getTableNames = (): ReadonlyArray<string> => Array.from(this.tables.keys());

  /**
   * Register a new table (for dynamic registration).
   *
   * Warns if overwriting an existing table configuration.
   * Use `forceRegister` to suppress the warning.
   *
   * @param config - Table configuration to register
   * @param options - Registration options
   * @param options.force - If true, suppress warning when overwriting
   *
   * @example
   * ```typescript
   * // Register new table
   * registry.registerTable({ name: 'users', ... });
   *
   * // Overwrites with warning
   * registry.registerTable({ name: 'users', ... }); // logs warning
   *
   * // Force overwrite without warning
   * registry.registerTable({ name: 'users', ... }, { force: true });
   * ```
   */
  registerTable = (config: UnifiedTableConfig, options?: { force?: boolean }): void => {
    const existing = this.tables.get(config.name);

    if (existing && !options?.force) {
      this.logger.warn(
        `Overwriting existing table configuration for '${config.name}'.`,
        'Use { force: true } to suppress this warning.'
      );
    }

    this.tables.set(config.name, config);
  };

  /**
   * Unregister a table.
   *
   * @param name - Table name to unregister
   * @returns true if the table was removed, false if it didn't exist
   */
  unregisterTable = (name: string): boolean => this.tables.delete(name);

  // ─── CONVEX API ACCESSORS (DataLayer, QueryEngine) ──────────────────────────

  /**
   * Get Convex function reference for a table and operation.
   * Returns undefined if not defined.
   */
  getConvexRef = (
    tableName: string,
    operation: 'list' | 'get' | 'create' | 'update' | 'delete'
  ): FunctionReference<'query'> | FunctionReference<'mutation'> | undefined => {
    const table = this.tables.get(tableName);
    return table?.convex?.[operation];
  };

  /**
   * Get mutation references for a table (create, update, delete).
   * Used by DataLayer hooks and SyncEngine.
   */
  getMutationRefs = (tableName: string): {
    create?: FunctionReference<'mutation'>;
    update?: FunctionReference<'mutation'>;
    delete?: FunctionReference<'mutation'>;
  } => {
    const table = this.tables.get(tableName);
    return {
      create: table?.convex?.create,
      update: table?.convex?.update,
      delete: table?.convex?.delete,
    };
  };

  /**
   * Check if table has a specific API operation defined.
   */
  hasConvexRef = (
    tableName: string,
    operation: 'list' | 'get' | 'create' | 'update' | 'delete'
  ): boolean => this.getConvexRef(tableName, operation) !== undefined;

  // ─── CACHE ACCESSORS (DataLayer, QueryEngine) ───────────────────────────────

  /**
   * Get stale time for a table (with default fallback).
   */
  getStaleTime = (tableName: string): number => {
    const table = this.tables.get(tableName);
    return table?.staleTime ?? this.defaults.staleTime;
  };

  /**
   * Get GC time for a table (with default fallback).
   */
  getGcTime = (tableName: string): number => {
    const table = this.tables.get(tableName);
    return table?.gcTime ?? this.defaults.gcTime;
  };

  // ─── CONFLICT ACCESSORS (SyncEngine) ────────────────────────────────────────

  /**
   * Get conflict resolution strategy for a table.
   */
  getConflictStrategy = (tableName: string): ConflictStrategy => {
    const table = this.tables.get(tableName);
    return table?.conflictStrategy ?? this.defaults.conflictStrategy;
  };

  /**
   * Get merge configuration for a table (for 'merge' strategy).
   */
  getMergeConfig = (tableName: string): UnifiedTableConfig['mergeConfig'] | undefined => {
    const table = this.tables.get(tableName);
    return table?.mergeConfig;
  };

  /**
   * Get all table conflict strategies (for SyncEngine initialization).
   */
  getTableStrategies = (): Record<string, ConflictStrategy> => {
    const strategies: Record<string, ConflictStrategy> = {};
    for (const [name, table] of this.tables) {
      if (table.conflictStrategy) {
        strategies[name] = table.conflictStrategy;
      }
    }
    return strategies;
  };

  /**
   * Get all table merge configs (for SyncEngine initialization).
   */
  getTableMergeConfigs = (): Record<string, UnifiedTableConfig['mergeConfig']> => {
    const configs: Record<string, UnifiedTableConfig['mergeConfig']> = {};
    for (const [name, table] of this.tables) {
      if (table.mergeConfig) {
        configs[name] = table.mergeConfig;
      }
    }
    return configs;
  };

  // ─── ANALYTICS ACCESSORS (QueryEngine) ──────────────────────────────────────

  /**
   * Check if analytics (DuckDB) is enabled for a table.
   */
  isAnalyticsEnabled = (tableName: string): boolean => {
    const table = this.tables.get(tableName);
    return table?.analytics?.enabled ?? false;
  };

  /**
   * Get analytics freshness requirement for a table.
   */
  getAnalyticsFreshness = (tableName: string): DataFreshnessLevel => {
    const table = this.tables.get(tableName);
    return table?.analytics?.freshness ?? DATA_FRESHNESS.NEAR_REALTIME;
  };

  /**
   * Get analytics stale time for a table.
   */
  getAnalyticsStaleTime = (tableName: string): number => {
    const table = this.tables.get(tableName);
    return table?.analytics?.staleTime ?? this.defaults.staleTime;
  };

  /**
   * Get all analytics-enabled tables.
   */
  getAnalyticsTables = (): ReadonlyArray<string> =>
    Array.from(this.tables.entries())
      .filter(([, config]) => config.analytics?.enabled)
      .map(([name]) => name);
}

// =============================================================================
// FACTORY
// =============================================================================

/**
 * Create a new TableRegistry instance.
 */
export const createTableRegistry = (
  tables: ReadonlyArray<UnifiedTableConfig> = [],
  defaults?: {
    staleTime?: number;
    gcTime?: number;
    conflictStrategy?: ConflictStrategy;
    debug?: boolean;
  }
): TableRegistry => new TableRegistry(tables, defaults);
