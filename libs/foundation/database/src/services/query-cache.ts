/**
 * Query Cache Service
 *
 * Service for managing query cache entries in the database.
 * Implements QueryCacheOperations interface.
 *
 * @module services/query-cache
 */

import { BaseService } from './base';
import type {
  QueryCacheOperations,
  QueryCacheEntry,
  QueryCacheEntryWithStatus,
  GetCacheOptions,
} from '../tables';
import { isCacheExpired, getCacheStatus } from '../tables';
import { QueryCacheStatus } from '../core/config';
import { queryCacheEntrySchema } from '../validation/schemas';
import { createValidationError } from '../errors';

/**
 * Query Cache Service
 * Implements QueryCacheOperations with early returns and const arrow functions
 */
export class QueryCacheService extends BaseService implements QueryCacheOperations {
  /**
   * Get a cache entry by query hash
   *
   * Uses early return pattern. Returns `null` when:
   * - The entry doesn't exist in the cache
   * - The entry is expired and `options.returnStale` is not set
   * - The entry exceeds `options.maxAge`
   *
   * @returns The cache entry with status, or `null` if not found/invalid
   */
  get = async (
    queryHash: string,
    options?: GetCacheOptions
  ): Promise<QueryCacheEntryWithStatus | null> => {
    const entry = await this.db.queries.get(queryHash);

    // Early return if not found
    if (!entry) return null;

    const status = getCacheStatus(entry, this.config.staleThreshold);

    // Early return if expired and not returning stale
    if (status === QueryCacheStatus.EXPIRED && !options?.returnStale) return null;

    // Early return if stale and maxAge exceeded
    if (options?.maxAge) {
      const age = Date.now() - entry.dataUpdatedAt;
      if (age > options.maxAge) return null;
    }

    return { ...entry, status };
  };

  /**
   * Set a cache entry
   * Validates before write
   */
  set = async (entry: QueryCacheEntry): Promise<void> => {
    // Validate before write
    const validation = queryCacheEntrySchema.safeParse(entry);
    if (!validation.success) {
      throw createValidationError('QueryCacheEntry', validation.error.message);
    }

    await this.db.queries.put(entry);
    this.log('Cache entry set:', entry.queryHash);
  };

  /**
   * Delete a cache entry by query hash
   */
  delete = async (queryHash: string): Promise<void> => {
    await this.db.queries.delete(queryHash);
    this.log('Cache entry deleted:', queryHash);
  };

  /**
   * Delete all entries for a specific table
   */
  deleteByTable = async (tableName: string): Promise<number> => {
    const count = await this.db.queries
      .where('tableName')
      .equals(tableName)
      .delete();
    this.log(`Deleted ${count} entries for table:`, tableName);
    return count;
  };

  /**
   * Delete all expired entries
   */
  deleteExpired = async (): Promise<number> => {
    const now = Date.now();
    const count = await this.db.queries.where('expiresAt').below(now).delete();
    if (count > 0) {
      this.log(`Deleted ${count} expired entries`);
    }
    return count;
  };

  /**
   * Get all entries for a specific table
   */
  getByTable = async (tableName: string): Promise<QueryCacheEntry[]> => {
    return this.db.queries.where('tableName').equals(tableName).toArray();
  };

  /**
   * Check if a fresh entry exists for a query hash
   */
  hasFresh = async (queryHash: string): Promise<boolean> => {
    const entry = await this.db.queries.get(queryHash);
    if (!entry) return false;
    return !isCacheExpired(entry);
  };

  /**
   * Get total count of cache entries
   */
  count = async (): Promise<number> => {
    return this.db.queries.count();
  };

  /**
   * Clear all cache entries
   */
  clear = async (): Promise<void> => {
    await this.db.queries.clear();
    this.log('Cache cleared');
  };

  // =========================================================================
  // Bulk Operations
  // =========================================================================

  /**
   * Get multiple cache entries by query hashes in a single operation
   *
   * Returns entries in the same order as the input hashes.
   * Missing entries are represented as null in the result array.
   *
   * @param queryHashes - Array of query hashes to retrieve
   * @param options - Cache retrieval options (applied to all entries)
   * @returns Array of cache entries (null for missing/invalid entries)
   */
  bulkGet = async (
    queryHashes: string[],
    options?: GetCacheOptions
  ): Promise<(QueryCacheEntryWithStatus | null)[]> => {
    if (queryHashes.length === 0) return [];

    // Get all entries in one query
    const entries = await this.db.queries.bulkGet(queryHashes);

    // Process each entry with the same logic as get()
    return entries.map((entry) => {
      if (!entry) return null;

      const status = getCacheStatus(entry, this.config.staleThreshold);

      // Return null if expired and not returning stale
      if (status === QueryCacheStatus.EXPIRED && !options?.returnStale) return null;

      // Return null if stale and maxAge exceeded
      if (options?.maxAge) {
        const age = Date.now() - entry.dataUpdatedAt;
        if (age > options.maxAge) return null;
      }

      return { ...entry, status };
    });
  };

  /**
   * Set multiple cache entries in a single operation
   * Validates all entries before writing
   */
  bulkSet = async (entries: QueryCacheEntry[]): Promise<void> => {
    if (entries.length === 0) return;

    // Validate all entries first
    for (const entry of entries) {
      const validation = queryCacheEntrySchema.safeParse(entry);
      if (!validation.success) {
        throw createValidationError('QueryCacheEntry', validation.error.message);
      }
    }

    await this.db.queries.bulkPut(entries);
    this.log(`Bulk set ${entries.length} cache entries`);
  };

  /**
   * Delete multiple cache entries by query hashes
   */
  bulkDelete = async (queryHashes: string[]): Promise<number> => {
    if (queryHashes.length === 0) return 0;

    await this.db.queries.bulkDelete(queryHashes);
    this.log(`Bulk deleted ${queryHashes.length} cache entries`);
    return queryHashes.length;
  };
}
