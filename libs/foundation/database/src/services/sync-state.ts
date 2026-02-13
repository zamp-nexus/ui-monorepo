/**
 * Sync State Service
 *
 * Service for managing sync state in the database.
 * Implements SyncStateOperations interface with type-safe convenience methods.
 *
 * @module services/sync-state
 */

import type { ZodSchema } from 'zod';
import { BaseService } from './base';
import type { NetworkStatus } from '@open-insights-web/foundation-data-model';
import type {
  SyncStateOperations,
  SyncStateEntry,
  LastSyncValue,
  DuckDBViewsValue,
} from '../tables';
import { z } from 'zod';
import { SYNC_STATE_KEYS, type SyncStateKey } from '../core/config';
import {
  syncStateEntrySchema,
  lastSyncValueSchema,
  networkStatusSchema,
  duckDBViewsValueSchema,
} from '../validation/schemas';
import { createValidationError } from '../errors';

// Simple schemas for primitive values
const numberSchema = z.number();

/**
 * Options for getting state value with schema validation
 */
export interface GetStateOptions<T> {
  /** Zod schema for runtime validation (required for type-safe return) */
  schema: ZodSchema<T>;
}

/**
 * Sync State Service
 * Implements SyncStateOperations with type-safe convenience methods
 */
export class SyncStateService extends BaseService implements SyncStateOperations {
  /**
   * Get state value by key with runtime validation
   *
   * @param key - The sync state key
   * @param options - Options with Zod schema for runtime validation
   * @returns The validated value if found and valid, undefined otherwise
   */
  get = async <T>(
    key: SyncStateKey,
    options: GetStateOptions<T>
  ): Promise<T | undefined> => {
    const entry = await this.db.syncState.get(key);
    if (!entry) return undefined;

    // Validate the value with provided schema
    const result = options.schema.safeParse(entry.value);
    if (!result.success) {
      this.log(`Validation failed for key "${key}":`, result.error.message);
      return undefined;
    }
    return result.data;
  };

  /**
   * Get raw state value by key without type validation
   *
   * Use this when you don't need type safety or when working with dynamic keys.
   * For type-safe access, use get() with a schema or the typed convenience methods.
   *
   * @param key - The sync state key
   * @returns The raw value if found, undefined otherwise
   */
  getRaw = async (key: SyncStateKey): Promise<unknown> => {
    const entry = await this.db.syncState.get(key);
    if (!entry) return undefined;
    return entry.value;
  };

  /**
   * Set state value with validation
   */
  set = async <T>(key: SyncStateKey, value: T): Promise<void> => {
    const entry: SyncStateEntry<T> = {
      key,
      value,
      updatedAt: Date.now(),
    };

    // Validate entry structure
    const validation = syncStateEntrySchema.safeParse(entry);
    if (!validation.success) {
      throw createValidationError('SyncStateEntry', validation.error.message);
    }

    // Cast to base SyncStateEntry for Dexie compatibility
    await this.db.syncState.put(entry as SyncStateEntry);
    this.log('Sync state set:', key);
  };

  /**
   * Delete state entry
   */
  delete = async (key: SyncStateKey): Promise<void> => {
    await this.db.syncState.delete(key);
    this.log('Sync state deleted:', key);
  };

  /**
   * Get all state entries
   */
  getAll = async (): Promise<SyncStateEntry[]> => {
    return this.db.syncState.toArray();
  };

  /**
   * Clear all state
   */
  clear = async (): Promise<void> => {
    await this.db.syncState.clear();
    this.log('Sync state cleared');
  };

  // =========================================================================
  // Type-safe convenience methods with Zod schema validation
  // =========================================================================

  /**
   * Get last sync value with Zod schema validation
   */
  getLastSync = async (): Promise<LastSyncValue | undefined> => {
    return this.get(SYNC_STATE_KEYS.LAST_SYNC, { schema: lastSyncValueSchema });
  };

  /**
   * Set last sync value
   */
  setLastSync = async (value: LastSyncValue): Promise<void> => {
    await this.set(SYNC_STATE_KEYS.LAST_SYNC, value);
  };

  /**
   * Get network status with Zod schema validation
   */
  getNetworkStatus = async (): Promise<NetworkStatus | undefined> => {
    return this.get(SYNC_STATE_KEYS.NETWORK_STATUS, { schema: networkStatusSchema });
  };

  /**
   * Set network status
   */
  setNetworkStatus = async (value: NetworkStatus): Promise<void> => {
    await this.set(SYNC_STATE_KEYS.NETWORK_STATUS, value);
  };

  /**
   * Get DuckDB views with Zod schema validation
   */
  getDuckDBViews = async (): Promise<DuckDBViewsValue | undefined> => {
    return this.get(SYNC_STATE_KEYS.DUCKDB_VIEWS, { schema: duckDBViewsValueSchema });
  };

  /**
   * Set DuckDB views
   */
  setDuckDBViews = async (value: DuckDBViewsValue): Promise<void> => {
    await this.set(SYNC_STATE_KEYS.DUCKDB_VIEWS, value);
  };

  /**
   * Get pending count with Zod schema validation
   */
  getPendingCount = async (): Promise<number> => {
    const value = await this.get(SYNC_STATE_KEYS.PENDING_COUNT, { schema: numberSchema });
    return value ?? 0;
  };

  /**
   * Set pending count
   */
  setPendingCount = async (count: number): Promise<void> => {
    await this.set(SYNC_STATE_KEYS.PENDING_COUNT, count);
  };

  /**
   * Get schema version with Zod schema validation
   */
  getSchemaVersion = async (): Promise<number> => {
    const value = await this.get(SYNC_STATE_KEYS.SCHEMA_VERSION, { schema: numberSchema });
    return value ?? 1;
  };

  /**
   * Set schema version
   */
  setSchemaVersion = async (version: number): Promise<void> => {
    await this.set(SYNC_STATE_KEYS.SCHEMA_VERSION, version);
  };
}
