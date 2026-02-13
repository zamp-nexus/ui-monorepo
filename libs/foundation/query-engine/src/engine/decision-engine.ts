/**
 * Decision Engine
 *
 * Intelligent routing engine that decides whether a query should be executed
 * via Convex API (real-time) or DuckDB (analytics).
 *
 * Decision Rules (in priority order):
 * 1. Mutations → API (create/update/delete always via Convex)
 * 2. Has joins → DuckDB (SQL required for joins)
 * 3. Has measures/aggregations → DuckDB (SQL required for aggregations)
 * 4. Multiple tables → DuckDB (implies joins needed)
 * 5. Local-only table → DuckDB (no API available)
 * 6. No list API defined → DuckDB (use Parquet files)
 * 7. Otherwise → API (simple query, real-time data)
 *
 * @module engine/decision-engine
 */

import {
  createSingletonFactory,
  type IDisposable,
  DisposedError,
} from '@open-insights-web/foundation-utils';
import type {
  DecisionContext,
  DecisionFactors,
  DecisionOptions,
  DecisionResult,
} from '../types/decision';
import { DECISION_REASONS } from '../types/decision';
import type { Query } from '../types/query';
import { OPERATIONS } from '../types/operations';
import { TableExtractor } from './table-extractor';

// =============================================================================
// DECISION ENGINE
// =============================================================================

/**
 * DecisionEngine - routes queries to API or DuckDB.
 *
 * Prefers API for simple queries (real-time via WebSocket).
 * Uses DuckDB only when necessary (joins, aggregations, no API).
 * Implements IDisposable for proper resource cleanup.
 *
 * @example
 * const engine = new DecisionEngine();
 *
 * const decision = engine.decide(query, {
 *   tables: ['users'],
 *   operation: 'list',
 *   tableConfigs: configsMap,
 *   isOnline: true,
 * });
 *
 * if (decision.path === 'api') {
 *   // Execute via Convex API
 * } else {
 *   // Execute via DuckDB
 * }
 *
 * // Cleanup when done
 * engine.dispose();
 */
export class DecisionEngine implements IDisposable {
  private readonly tableExtractor: TableExtractor;
  private _isDisposed = false;

  constructor(tableExtractor?: TableExtractor) {
    this.tableExtractor = tableExtractor ?? new TableExtractor();
  }

  /**
   * Check if the engine is disposed.
   */
  get isDisposed(): boolean {
    return this._isDisposed;
  }

  /**
   * Dispose of resources.
   */
  dispose(): void {
    if (this._isDisposed) return;
    this._isDisposed = true;
    // No resources to dispose, but pattern is implemented for consistency
  }

  /**
   * Ensure the engine is not disposed before use.
   */
  private ensureNotDisposed(): void {
    if (this._isDisposed) {
      throw new DisposedError('DecisionEngine');
    }
  }

  /**
   * Make a routing decision for a query.
   *
   * @param query - The query
   * @param context - Decision context with tables, operation, and config
   * @param options - Optional decision options
   * @returns Decision result with path, reason, and confidence
   */
  decide = (
    query: Query,
    context: DecisionContext,
    options?: DecisionOptions
  ): DecisionResult => {
    this.ensureNotDisposed();
    const { tables, operation, tableConfigs } = context;

    // Allow forced path for testing/override
    if (options?.forcePath) {
      return {
        path: options.forcePath,
        reason: DECISION_REASONS.FORCED_PATH,
        confidence: 100,
        factors: options.includeFactors ? this.computeFactors(query, context) : undefined,
      };
    }

    // Compute decision factors
    const factors = this.computeFactors(query, context);

    // ─────────────────────────────────────────────────────────────────────────
    // RULE 1: Mutations → API
    // Mutations always go through Convex API for data integrity
    // ─────────────────────────────────────────────────────────────────────────
    if (factors.isMutation) {
      const primaryTable = tables[0];
      const config = tableConfigs.get(primaryTable);

      // Check if mutation API exists
      if (!config?.convex?.[operation as 'create' | 'update' | 'delete']) {
        return {
          path: 'api',
          reason: DECISION_REASONS.NO_MUTATION_API,
          confidence: 0,
          warnings: [`Cannot perform '${operation}' - no API defined`],
          factors: options?.includeFactors ? factors : undefined,
        };
      }

      return {
        path: 'api',
        reason: DECISION_REASONS.MUTATION_USES_API,
        confidence: 100,
        apiFunction: operation,
        factors: options?.includeFactors ? factors : undefined,
      };
    }

    // ─────────────────────────────────────────────────────────────────────────
    // RULE 2: Has joins → DuckDB
    // Joins require SQL execution
    // ─────────────────────────────────────────────────────────────────────────
    if (factors.hasJoins) {
      return {
        path: 'duckdb',
        reason: DECISION_REASONS.HAS_JOINS,
        confidence: 100,
        tablesToLoad: [...tables],
        factors: options?.includeFactors ? factors : undefined,
      };
    }

    // ─────────────────────────────────────────────────────────────────────────
    // RULE 3: Has measures → DuckDB
    // Aggregations require SQL execution
    // ─────────────────────────────────────────────────────────────────────────
    if (factors.hasMeasures) {
      return {
        path: 'duckdb',
        reason: DECISION_REASONS.HAS_MEASURES,
        confidence: 100,
        tablesToLoad: [...tables],
        factors: options?.includeFactors ? factors : undefined,
      };
    }

    // ─────────────────────────────────────────────────────────────────────────
    // RULE 4: Multiple tables → DuckDB
    // Multiple tables without explicit joins still need SQL
    // ─────────────────────────────────────────────────────────────────────────
    if (factors.tableCount > 1) {
      return {
        path: 'duckdb',
        reason: DECISION_REASONS.MULTIPLE_TABLES,
        confidence: 100,
        tablesToLoad: [...tables],
        factors: options?.includeFactors ? factors : undefined,
      };
    }

    // From here, we have a single table

    const primaryTable = tables[0];
    const config = tableConfigs.get(primaryTable);

    // ─────────────────────────────────────────────────────────────────────────
    // RULE 5: Local-only table → DuckDB
    // Local files can only be queried via DuckDB
    // ─────────────────────────────────────────────────────────────────────────
    if (factors.hasLocalTables || config?.source === 'local') {
      return {
        path: 'duckdb',
        reason: DECISION_REASONS.LOCAL_TABLE,
        confidence: 100,
        tablesToLoad: [], // Already local
        factors: options?.includeFactors ? factors : undefined,
      };
    }

    // ─────────────────────────────────────────────────────────────────────────
    // RULE 6: No API → DuckDB
    // If table has no list API, use Parquet files
    // ─────────────────────────────────────────────────────────────────────────
    const wantsGet = !!query.entityId || operation === 'get';
    const hasListApi = !!config?.convex?.list;
    const hasGetApi = !!config?.convex?.get;

    if (!wantsGet && !hasListApi) {
      return {
        path: 'duckdb',
        reason: DECISION_REASONS.NO_LIST_API,
        confidence: 100,
        tablesToLoad: [primaryTable],
        factors: options?.includeFactors ? factors : undefined,
      };
    }

    if (wantsGet && !hasGetApi) {
      // For GET without get API, fall back to list with filter
      if (!hasListApi) {
        return {
          path: 'duckdb',
          reason: DECISION_REASONS.NO_API_AVAILABLE,
          confidence: 100,
          tablesToLoad: [primaryTable],
          factors: options?.includeFactors ? factors : undefined,
        };
      }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // RULE 7: Analytics preference → DuckDB
    // If analytics is preferred and freshness allows it
    // ─────────────────────────────────────────────────────────────────────────
    if (options?.preferAnalytics) {
      const freshness = config?.analytics?.freshness;
      if (freshness === 'eventual') {
        return {
          path: 'duckdb',
          reason: DECISION_REASONS.ANALYTICS_PREFERRED,
          confidence: 80,
          tablesToLoad: [primaryTable],
          factors: options?.includeFactors ? factors : undefined,
        };
      }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // DEFAULT: Simple query → API
    // Use real-time Convex API for simple queries
    // ─────────────────────────────────────────────────────────────────────────
    return {
      path: 'api',
      reason: DECISION_REASONS.SIMPLE_QUERY_WITH_API,
      confidence: 100,
      apiFunction: wantsGet ? OPERATIONS.GET : OPERATIONS.LIST,
      factors: options?.includeFactors ? factors : undefined,
    };
  };

  /**
   * Compute decision factors from query and context.
   */
  private computeFactors = (
    query: Query,
    context: DecisionContext
  ): DecisionFactors => {
    const { tables, operation, tableConfigs, isOnline } = context;

    // Check for mutations
    const isMutation =
      operation === 'create' || operation === 'update' || operation === 'delete';

    // Check for joins
    const hasJoins = (query.joins?.length ?? 0) > 0;

    // Check for measures
    const hasMeasures = (query.measures?.length ?? 0) > 0;

    // Check table sources
    let allTablesConvex = true;
    let allTablesHaveApi = true;
    let hasLocalTables = false;

    for (const tableName of tables) {
      const config = tableConfigs.get(tableName);
      if (!config) {
        allTablesConvex = false;
        allTablesHaveApi = false;
        continue;
      }

      if (config.source === 'local') {
        hasLocalTables = true;
        allTablesConvex = false;
      }

      if (!config.convex?.list && !config.convex?.get) {
        allTablesHaveApi = false;
      }
    }

    return {
      isMutation,
      hasJoins,
      hasMeasures,
      tableCount: tables.length,
      allTablesConvex,
      allTablesHaveApi,
      isOnline,
      hasLocalTables,
    };
  };

  /**
   * Check if a query can use the API path (without full decision).
   * Useful for quick checks before full decision.
   */
  canUseApi = (query: Query, context: DecisionContext): boolean => {
    // Quick checks
    if ((query.joins?.length ?? 0) > 0) return false;
    if ((query.measures?.length ?? 0) > 0) return false;
    if (context.tables.length > 1) return false;

    const primaryTable = context.tables[0];
    const config = context.tableConfigs.get(primaryTable);

    if (!config) return false;
    if (config.source === 'local') return false;
    if (!config.convex?.list && !config.convex?.get) return false;

    return true;
  };

  /**
   * Check if a query requires DuckDB (without full decision).
   * Useful for quick checks before full decision.
   */
  requiresDuckDB = (query: Query): boolean => {
    // Joins always require DuckDB
    if ((query.joins?.length ?? 0) > 0) return true;

    // Measures always require DuckDB
    if ((query.measures?.length ?? 0) > 0) return true;

    // Check if multiple tables
    const tables = this.tableExtractor.extract(query);
    if (tables.length > 1) return true;

    return false;
  };
}

// =============================================================================
// FACTORY
// =============================================================================

/**
 * Create a new DecisionEngine instance.
 */
export const createDecisionEngine = (tableExtractor?: TableExtractor): DecisionEngine => {
  return new DecisionEngine(tableExtractor);
};

// =============================================================================
// SINGLETON FACTORY
// =============================================================================

/**
 * Configuration for DecisionEngine singleton.
 */
export interface DecisionEngineConfig {
  readonly tableExtractor?: TableExtractor;
}

/**
 * Singleton factory for DecisionEngine.
 *
 * Use this when you need a shared DecisionEngine instance across the application.
 * The instance will be created once and reused for all subsequent calls.
 *
 * @example
 * ```typescript
 * // Get the singleton instance
 * const engine = getDecisionEngine();
 *
 * // Make decisions
 * const decision = engine.decide(query, context);
 *
 * // Reset for testing
 * await resetDecisionEngine();
 * ```
 */
const decisionEngineFactory = createSingletonFactory<DecisionEngine, DecisionEngineConfig>(
  (config) => new DecisionEngine(config?.tableExtractor),
  {
    name: 'DecisionEngine',
    warnOnConfigOverride: true,
    onDispose: (instance) => (instance as DecisionEngine).dispose(),
    defaultConfig: {},
  }
);

/**
 * Get the singleton DecisionEngine instance.
 */
export const getDecisionEngine = (config?: DecisionEngineConfig): DecisionEngine => {
  return decisionEngineFactory.getInstance(config);
};

/**
 * Reset the singleton DecisionEngine instance (for testing).
 */
export const resetDecisionEngine = async (): Promise<void> => {
  await decisionEngineFactory.reset();
};

/**
 * Check if a DecisionEngine singleton instance exists.
 */
export const hasDecisionEngineInstance = (): boolean => {
  return decisionEngineFactory.hasInstance();
};
