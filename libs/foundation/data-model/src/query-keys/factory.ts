/**
 * Query key factory implementations
 * @module query-keys/factory
 */

import type {
  EntityQueryKeyFactory,
  AnalyticsQueryKey,
  QueryKeyMeta,
  QueryKeyBase,
  EntityTableName,
} from './types';
import { hashStringSync } from '@open-insights-web/foundation-utils';

/**
 * Create an entity query key factory
 */
export function createQueryKeys<
  TEntity extends string,
  TFilters extends Record<string, unknown> = Record<string, unknown>
>(entity: TEntity): EntityQueryKeyFactory<TEntity, TFilters> {
  return {
    all: [entity] as const,

    list: (filters?: TFilters) => {
      if (filters && Object.keys(filters).length > 0) {
        return [entity, 'list', filters] as const;
      }
      return [entity, 'list'] as const;
    },

    detail: (id: string) => [entity, 'detail', id] as const,

    infinite: (filters?: TFilters) => {
      if (filters && Object.keys(filters).length > 0) {
        return [entity, 'infinite', filters] as const;
      }
      return [entity, 'infinite'] as const;
    },
  };
}

/**
 * Create an analytics query key
 */
export function createAnalyticsQueryKey<
  TParams extends Record<string, unknown> | undefined = undefined
>(
  tables: EntityTableName | EntityTableName[],
  queryName: string,
  params?: TParams
): AnalyticsQueryKey<TParams> {
  const tablesString = Array.isArray(tables)
    ? `tables:${tables.sort().join(',')}`
    : `tables:${tables}`;

  const queryString = `query:${queryName}`;

  if (params && Object.keys(params).length > 0) {
    return ['analytics', tablesString, queryString, params] as unknown as AnalyticsQueryKey<TParams>;
  }

  return ['analytics', tablesString, queryString] as unknown as AnalyticsQueryKey<TParams>;
}

/**
 * Extract metadata from a query key
 */
export function extractQueryKeyMeta(queryKey: QueryKeyBase): QueryKeyMeta {
  const [first, second] = queryKey;

  // Analytics query
  if (first === 'analytics' && typeof second === 'string') {
    const tablesMatch = second.match(/^tables:(.+)$/);
    const tables = tablesMatch ? tablesMatch[1].split(',') : [];

    return {
      entity: 'analytics',
      isAnalytics: true,
      tables,
      queryKey,
    };
  }

  // Entity query
  const entity = String(first);
  const scope = typeof second === 'string' && ['list', 'detail', 'infinite'].includes(second)
    ? (second as 'list' | 'detail' | 'infinite')
    : undefined;

  return {
    entity,
    scope,
    isAnalytics: false,
    queryKey,
  };
}

/**
 * Serialize a value with sorted object keys for deterministic output
 */
function serializeWithSortedKeys(value: unknown): string {
  return JSON.stringify(value, (_, val) => {
    // Sort object keys for deterministic hashing
    if (val && typeof val === 'object' && !Array.isArray(val)) {
      return Object.keys(val)
        .sort()
        .reduce<Record<string, unknown>>((sorted, key) => {
          sorted[key] = (val as Record<string, unknown>)[key];
          return sorted;
        }, {});
    }
    return val;
  });
}

/**
 * Generate a deterministic hash for a query key
 * Used as cache key in Dexie
 *
 * Note: Uses sorted keys serialization to ensure deterministic hashing
 * regardless of object property insertion order.
 *
 * Uses hashStringSync from foundation-utils (djb2 algorithm) for consistency
 * across the codebase.
 */
export function hashQueryKey(queryKey: QueryKeyBase): string {
  const serialized = serializeWithSortedKeys(queryKey);
  return hashStringSync(serialized);
}

/**
 * Check if a query key matches a pattern
 * Used for cache invalidation
 */
export function matchesQueryKey(
  queryKey: QueryKeyBase,
  pattern: QueryKeyBase
): boolean {
  if (pattern.length > queryKey.length) {
    return false;
  }

  for (let i = 0; i < pattern.length; i++) {
    const patternPart = pattern[i];
    const keyPart = queryKey[i];

    // Wildcard match
    if (patternPart === '*') {
      continue;
    }

    // Object comparison
    if (
      typeof patternPart === 'object' &&
      patternPart !== null &&
      typeof keyPart === 'object' &&
      keyPart !== null
    ) {
      // Check if pattern object is subset of key object
      const patternKeys = Object.keys(patternPart);
      const matches = patternKeys.every(
        (k) =>
          (patternPart as Record<string, unknown>)[k] ===
          (keyPart as Record<string, unknown>)[k]
      );
      if (!matches) return false;
      continue;
    }

    // Direct comparison
    if (patternPart !== keyPart) {
      return false;
    }
  }

  return true;
}

// Pre-defined query key factories for common entities
export const userKeys = createQueryKeys<'users'>('users');
export const eventKeys = createQueryKeys<'events'>('events');
export const sessionKeys = createQueryKeys<'sessions'>('sessions');
export const tenantKeys = createQueryKeys<'tenants'>('tenants');
export const projectKeys = createQueryKeys<'projects'>('projects');
export const dashboardKeys = createQueryKeys<'dashboards'>('dashboards');
export const reportKeys = createQueryKeys<'reports'>('reports');
