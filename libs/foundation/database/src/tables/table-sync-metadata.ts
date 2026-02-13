/**
 * Table Sync Metadata definitions
 *
 * Tracks sync state for analytics tables (parquet file downloads).
 * Used by background file sync to determine when tables need updating.
 *
 * @module tables/table-sync-metadata
 */

/**
 * Table sync metadata entry
 *
 * Tracks the sync state for a single analytics table:
 * - lastIngestedAt: When the server last updated the table (from API)
 * - loadedAt: When we downloaded the files locally
 * - fileHashes: Map of filename -> content hash for change detection
 */
export interface TableSyncMetadataEntry {
  /** Table name (primary key) */
  readonly name: string;

  /**
   * When the server last updated/ingested this table.
   * From DataSourceTableInfo.lastIngestedAt.
   * Used to determine if newer data is available.
   */
  readonly lastIngestedAt: number;

  /**
   * When we last downloaded files for this table.
   * If lastIngestedAt > loadedAt, newer data is available.
   */
  readonly loadedAt: number;

  /**
   * Content hashes of downloaded files.
   * Map of filename -> hash for detecting changed files.
   * Stored as a record for JSON serialization.
   */
  readonly fileHashes: Record<string, string>;

  /**
   * Total size of downloaded files in bytes.
   */
  readonly totalSize: number;

  /**
   * Total row count across all files.
   */
  readonly totalRows: number;
}

/**
 * Create a new table sync metadata entry
 */
export const createTableSyncMetadataEntry = (
  name: string,
  lastIngestedAt: number,
  fileHashes: Record<string, string>,
  options?: {
    totalSize?: number;
    totalRows?: number;
  }
): TableSyncMetadataEntry => ({
  name,
  lastIngestedAt,
  loadedAt: Date.now(),
  fileHashes,
  totalSize: options?.totalSize ?? 0,
  totalRows: options?.totalRows ?? 0,
});

/**
 * Check if a table needs update based on timestamps
 *
 * @param entry - Local metadata entry (or null if never synced)
 * @param remoteLastIngestedAt - Server's lastIngestedAt timestamp
 * @returns true if table needs to be updated
 */
export const needsTableUpdate = (
  entry: TableSyncMetadataEntry | null | undefined,
  remoteLastIngestedAt: number
): boolean => {
  if (!entry) return true; // Never synced
  return remoteLastIngestedAt > entry.loadedAt;
};

/**
 * Get files that need downloading by comparing hashes
 *
 * @param localHashes - Local file hashes (or empty record if never synced)
 * @param remoteFiles - Remote files with hashes
 * @returns Array of filenames that need downloading
 */
export const getFilesNeedingDownload = <T extends { filename: string; hash?: string }>(
  localHashes: Record<string, string>,
  remoteFiles: readonly T[]
): T[] => {
  return remoteFiles.filter((file) => {
    const localHash = localHashes[file.filename];
    // Download if: no local hash, or hash differs
    return !localHash || localHash !== file.hash;
  });
};

/**
 * Table sync metadata operations interface
 */
export interface TableSyncMetadataOperations {
  /** Get metadata for a table */
  get(tableName: string): Promise<TableSyncMetadataEntry | undefined>;

  /** Set metadata for a table */
  set(entry: TableSyncMetadataEntry): Promise<void>;

  /** Delete metadata for a table */
  delete(tableName: string): Promise<void>;

  /** Get all metadata entries */
  getAll(): Promise<TableSyncMetadataEntry[]>;

  /** Get multiple entries by table names */
  getMany(tableNames: string[]): Promise<Map<string, TableSyncMetadataEntry | undefined>>;

  /** Check if metadata exists for a table */
  exists(tableName: string): Promise<boolean>;

  /** Clear all metadata */
  clear(): Promise<void>;

  /** Get count of tracked tables */
  count(): Promise<number>;
}
