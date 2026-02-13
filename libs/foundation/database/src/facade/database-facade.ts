/**
 * Database Facade
 *
 * Main entry point for interacting with the database.
 * Encapsulates all services and provides a clean API.
 *
 * @module facade/database-facade
 */

import isEqual from 'fast-deep-equal';
import {
  createSingletonFactory,
  createDeepEqualComparison,
} from '@open-insights-web/foundation-utils';
import { InsightsDatabase } from '../core/database';
import type { DatabaseConfig, DatabaseStats } from '../core';
import { QueryCacheService } from '../services/query-cache';
import { MutationQueueService } from '../services/mutation-queue';
import { SyncStateService } from '../services/sync-state';
import { OpfsMetadataService } from '../services/opfs-metadata';
import { TableSyncMetadataService } from '../services/table-sync-metadata';
import { setDatabaseInstance, onDatabaseReset } from '../core/database-registry';

/**
 * Database Facade
 *
 * Provides encapsulated access to all database services.
 * Use getDatabaseFacade() for singleton access.
 */
export class DatabaseFacade {
  /** Query cache service */
  readonly queries: QueryCacheService;

  /** Mutation queue service */
  readonly mutations: MutationQueueService;

  /** Sync state service */
  readonly syncState: SyncStateService;

  /** OPFS metadata service */
  readonly opfsMetadata: OpfsMetadataService;

  /** Table sync metadata service (tracks parquet file sync state) */
  readonly tableSyncMetadata: TableSyncMetadataService;

  /** Database configuration */
  readonly config: DatabaseConfig;

  private readonly db: InsightsDatabase;

  private constructor(db: InsightsDatabase) {
    this.db = db;
    this.config = db.config;
    this.queries = new QueryCacheService(db, db.config);
    this.mutations = new MutationQueueService(db, db.config);
    this.syncState = new SyncStateService(db, db.config);
    this.opfsMetadata = new OpfsMetadataService(db, db.config);
    this.tableSyncMetadata = new TableSyncMetadataService(db, db.config);
  }

  /**
   * Create a new DatabaseFacade instance
   *
   * The facade owns the database lifecycle. The database instance is registered
   * in the shared registry so that getDatabase() returns the same instance.
   */
  static create = (config?: Partial<DatabaseConfig>): DatabaseFacade => {
    const db = new InsightsDatabase(config);
    // Register in shared registry so getDatabase() returns this instance
    setDatabaseInstance(db);
    return new DatabaseFacade(db);
  };

  /**
   * Get database statistics
   */
  getStats = async (): Promise<DatabaseStats> => {
    return this.db.getStats();
  };

  /**
   * Clear all data from all tables
   */
  clearAll = async (): Promise<void> => {
    await this.db.clearAll();
  };

  /**
   * Start auto-cleanup of expired data
   */
  startCleanup = (): void => {
    this.db.startCleanup();
  };

  /**
   * Stop auto-cleanup
   */
  stopCleanup = (): void => {
    this.db.stopCleanup();
  };

  /**
   * Run cleanup manually
   */
  cleanup = async (): Promise<number> => {
    return this.db.cleanup();
  };

  /**
   * Close the database connection
   */
  close = (): void => {
    this.db.close();
  };

  /**
   * Get the underlying InsightsDatabase instance
   * Use this when you need to pass the database to other components
   * that require the raw database (e.g., SyncCoordinator)
   */
  getDatabase = (): InsightsDatabase => {
    return this.db;
  };

  /**
   * Execute operations within a transaction
   *
   * All operations in the callback function will be executed atomically.
   * If any operation fails, all changes will be rolled back.
   *
   * @param mode - Transaction mode ('r' for read, 'rw' for read-write)
   * @param tables - Table names to include in the transaction
   * @param fn - Async function containing the operations to execute
   * @returns The return value of the callback function
   *
   * @example
   * ```typescript
   * // Atomic update of cache and mutation queue
   * await facade.transaction('rw', ['queries', 'mutations'], async () => {
   *   await facade.queries.set(cacheEntry);
   *   await facade.mutations.add(mutationEntry);
   * });
   * ```
   */
  transaction = async <T>(
    mode: 'r' | 'rw',
    tables: ('queries' | 'mutations' | 'syncState' | 'opfsFiles' | 'tableSyncMetadata')[],
    fn: () => Promise<T>
  ): Promise<T> => {
    // Map table names to actual Dexie tables
    const tableRefs = tables.map((name) => {
      switch (name) {
        case 'queries':
          return this.db.queries;
        case 'mutations':
          return this.db.mutations;
        case 'syncState':
          return this.db.syncState;
        case 'opfsFiles':
          return this.db.opfsFiles;
        case 'tableSyncMetadata':
          return this.db.tableSyncMetadata;
      }
    });

    return this.db.transaction(mode, tableRefs, fn);
  };
}

// =============================================================================
// Singleton Management
// =============================================================================

/**
 * Singleton factory for DatabaseFacade
 */
const facadeFactory = createSingletonFactory(
  (config: Partial<DatabaseConfig> | undefined) => {
    const facade = DatabaseFacade.create(config);

    // Register to be notified if the database is reset externally
    // This ensures facade and database singletons stay in sync
    onDatabaseReset(async () => {
      // Database was reset externally - reset the facade too
      // Awaiting ensures no race condition where a new instance is
      // created before the reset completes
      await facadeFactory.reset();
    });

    return facade;
  },
  {
    name: 'DatabaseFacade',
    compareConfig: createDeepEqualComparison(isEqual, 'DatabaseFacade'),
    onDispose: (instance) => {
      // Clear the database from registry when facade is disposed
      setDatabaseInstance(null);
      (instance as DatabaseFacade).close();
    },
  }
);

/**
 * Get or create a singleton DatabaseFacade instance
 *
 * Note: If an instance already exists, the config parameter is ignored.
 * Call resetDatabaseFacade() first to change configuration.
 */
export const getDatabaseFacade = (
  config?: Partial<DatabaseConfig>
): DatabaseFacade => {
  return facadeFactory.getInstance(config);
};

/**
 * Reset the singleton DatabaseFacade instance
 *
 * Closes the current instance and clears the singleton.
 * Next call to getDatabaseFacade() will create a new instance.
 *
 * Note: The facade owns the database lifecycle, so resetting the facade
 * automatically closes the database. No need to call resetDatabase() separately.
 * 
 * @returns Promise that resolves when reset is complete
 */
export const resetDatabaseFacade = async (): Promise<void> => {
  await facadeFactory.reset();
};

/**
 * Check if a facade instance exists
 */
export const hasDatabaseFacade = (): boolean => {
  return facadeFactory.hasInstance();
};
