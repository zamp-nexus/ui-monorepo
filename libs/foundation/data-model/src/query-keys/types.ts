/**
 * Query key type definitions
 * @module query-keys/types
 */

/**
 * Base query key tuple
 */
export type QueryKeyBase = readonly unknown[];

/**
 * Entity query key structure
 * Format: [entity, scope?, filters?]
 */
export type EntityQueryKey<
  TEntity extends string = string,
  TScope extends string | undefined = string | undefined,
  TFilters extends Record<string, unknown> | undefined = Record<string, unknown> | undefined
> = TScope extends undefined
  ? TFilters extends undefined
    ? readonly [TEntity]
    : readonly [TEntity, TFilters]
  : TFilters extends undefined
    ? readonly [TEntity, TScope]
    : readonly [TEntity, TScope, TFilters];

/**
 * Analytics query key structure
 * Format: ['analytics', tables, queryName, params?]
 */
export type AnalyticsQueryKey<
  TParams extends Record<string, unknown> | undefined = Record<string, unknown> | undefined
> = TParams extends undefined
  ? readonly ['analytics', string, string]
  : readonly ['analytics', string, string, TParams];

/**
 * Query scope types
 */
export type QueryScope = 'list' | 'detail' | 'infinite';

/**
 * Entity query key factory interface
 */
export interface EntityQueryKeyFactory<
  TEntity extends string,
  TFilters extends Record<string, unknown> = Record<string, unknown>
> {
  /** All queries for this entity - ['entity'] */
  all: readonly [TEntity];

  /** List queries - ['entity', 'list'] or ['entity', 'list', filters] */
  list: (filters?: TFilters) => readonly [TEntity, 'list'] | readonly [TEntity, 'list', TFilters];

  /** Detail query - ['entity', 'detail', id] */
  detail: (id: string) => readonly [TEntity, 'detail', string];

  /** Infinite query - ['entity', 'infinite'] or ['entity', 'infinite', filters] */
  infinite: (filters?: TFilters) => readonly [TEntity, 'infinite'] | readonly [TEntity, 'infinite', TFilters];
}

/**
 * Query hash for cache key
 */
export type QueryHash = string;

/**
 * Query key metadata for persistence
 */
export interface QueryKeyMeta {
  /** The entity this query belongs to */
  entity: string;
  /** Query scope (list, detail, infinite) */
  scope?: QueryScope;
  /** Whether this is an analytics query */
  isAnalytics: boolean;
  /** Tables involved (for analytics) */
  tables?: string[];
  /** Original query key */
  queryKey: QueryKeyBase;
}

/**
 * Table name constants for type safety
 *
 * These represent known entity tables in the application.
 */
export const TABLE_NAMES = {
  USERS: 'users',
  EVENTS: 'events',
  SESSIONS: 'sessions',
  TENANTS: 'tenants',
  PROJECTS: 'projects',
  DASHBOARDS: 'dashboards',
  REPORTS: 'reports',
  INTEGRATIONS: 'integrations',
} as const;

/**
 * Known entity table names union type
 *
 * This represents the known entity tables in the application.
 * For SQL identifiers that can be any table name, use `SqlTableName`
 * from the branded types module instead.
 */
export type EntityTableName = (typeof TABLE_NAMES)[keyof typeof TABLE_NAMES];

/**
 * Convex function path type
 */
export type ConvexFunctionPath = `${string}:${string}`;

/**
 * Query function reference
 */
export interface QueryFunctionRef<TInput = unknown, TOutput = unknown> {
  path: ConvexFunctionPath;
  input?: TInput;
  _output?: TOutput; // Phantom type for inference
}
