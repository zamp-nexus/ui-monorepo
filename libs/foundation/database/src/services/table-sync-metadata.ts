/**
 * Table Sync Metadata Service
 *
 * Service for managing table sync metadata in the database.
 * Tracks parquet file download state for analytics tables.
 *
 * @module services/table-sync-metadata
 */

import { BaseService } from './base';
import type {
  TableSyncMetadataOperations,
  TableSyncMetadataEntry,
} from '../tables/table-sync-metadata';
import { tableSyncMetadataEntrySchema } from '../validation/schemas';
import { createValidationError } from '../errors';

/**
 * Table Sync Metadata Service
 * Implements TableSyncMetadataOperations
 */
export class TableSyncMetadataService
  extends BaseService
  implements TableSyncMetadataOperations
{
  /**
   * Get metadata for a table by name
   */
  get = async (tableName: string): Promise<TableSyncMetadataEntry | undefined> => {
    return this.db.tableSyncMetadata.get(tableName);
  };

  /**
   * Set metadata for a table
   * Validates before write
   */
  set = async (entry: TableSyncMetadataEntry): Promise<void> => {
    // Validate entry
    const validation = tableSyncMetadataEntrySchema.safeParse(entry);
    if (!validation.success) {
      throw createValidationError('TableSyncMetadataEntry', validation.error.message);
    }

    await this.db.tableSyncMetadata.put(entry);
    this.log('Table sync metadata set:', entry.name);
  };

  /**
   * Delete metadata for a table
   */
  delete = async (tableName: string): Promise<void> => {
    await this.db.tableSyncMetadata.delete(tableName);
    this.log('Table sync metadata deleted:', tableName);
  };

  /**
   * Get all metadata entries
   */
  getAll = async (): Promise<TableSyncMetadataEntry[]> => {
    return this.db.tableSyncMetadata.toArray();
  };

  /**
   * Get multiple entries by table names
   */
  getMany = async (
    tableNames: string[]
  ): Promise<Map<string, TableSyncMetadataEntry | undefined>> => {
    const result = new Map<string, TableSyncMetadataEntry | undefined>();

    // Batch get for efficiency
    const entries = await this.db.tableSyncMetadata.bulkGet(tableNames);

    for (let i = 0; i < tableNames.length; i++) {
      result.set(tableNames[i], entries[i]);
    }

    return result;
  };

  /**
   * Check if metadata exists for a table
   */
  exists = async (tableName: string): Promise<boolean> => {
    const entry = await this.db.tableSyncMetadata.get(tableName);
    return entry !== undefined;
  };

  /**
   * Clear all metadata
   */
  clear = async (): Promise<void> => {
    await this.db.tableSyncMetadata.clear();
    this.log('Table sync metadata cleared');
  };

  /**
   * Get count of tracked tables
   */
  count = async (): Promise<number> => {
    return this.db.tableSyncMetadata.count();
  };

  /**
   * Update metadata for a table (partial update)
   */
  update = async (
    tableName: string,
    changes: Partial<Omit<TableSyncMetadataEntry, 'name'>>
  ): Promise<void> => {
    await this.db.tableSyncMetadata.update(tableName, changes);
    this.log('Table sync metadata updated:', tableName);
  };
}
