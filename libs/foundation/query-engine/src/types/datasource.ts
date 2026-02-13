/**
 * DataSource Types
 *
 * Types for the DataSource API that provides Parquet file URLs
 * with lastIngestedAt for stale-while-revalidate caching.
 *
 * @module types/datasource
 */

// =============================================================================
// DATASOURCE FILE INFO
// =============================================================================

/**
 * Information about a single file in the data source.
 * Files are typically Parquet format for efficient analytics.
 */
export interface DataSourceFileInfo {
  /**
   * Signed download URL (temporary, expires).
   * May be S3 presigned URL, Convex file storage URL, etc.
   */
  readonly url: string;

  /**
   * Filename for local storage.
   * Should be consistent for caching purposes.
   *
   * @example 'orders_2024_01.parquet'
   */
  readonly filename: string;

  /**
   * File size in bytes.
   * Used for download progress tracking.
   */
  readonly size: number;

  /**
   * Row count in this file (optional).
   * Helps with estimating query performance.
   */
  readonly rowCount?: number;

  /**
   * Content hash for change detection.
   * If hash changes, file should be re-downloaded.
   */
  readonly hash?: string;

  /**
   * Partition information (if file is part of partitioned table).
   *
   * @example { year: '2024', month: '01' }
   */
  readonly partition?: Readonly<Record<string, string>>;
}

// =============================================================================
// DATASOURCE TABLE INFO
// =============================================================================

/**
 * Information about a table's data in the data source.
 *
 * The KEY FIELD is `lastIngestedAt` which tells the client when
 * the backend last updated this table. This enables stale-while-revalidate:
 *
 * - If client's loadedAt < lastIngestedAt → newer data available
 * - If client's loadedAt >= lastIngestedAt → data is current
 */
export interface DataSourceTableInfo {
  /**
   * Table name (must match registered table name).
   */
  readonly name: string;

  /**
   * Parquet files for this table.
   * May be multiple files (partitioned by time, region, etc.).
   */
  readonly files: ReadonlyArray<DataSourceFileInfo>;

  /**
   * **KEY FIELD**: When backend last updated/ingested this table.
   *
   * This timestamp is compared with the client's loadedAt:
   * - lastIngestedAt > loadedAt → download newer files
   * - lastIngestedAt <= loadedAt → files are current
   *
   * @example 1705744800000 (Unix timestamp in milliseconds)
   */
  readonly lastIngestedAt: number;

  /**
   * Total row count across all files.
   */
  readonly totalRows: number;

  /**
   * Total size across all files (bytes).
   */
  readonly totalSize: number;

  /**
   * Table schema (column name → DuckDB type).
   *
   * @example { id: 'VARCHAR', amount: 'DOUBLE', created_at: 'TIMESTAMP' }
   */
  readonly schema: Readonly<Record<string, string>>;

  /**
   * When the signed URLs expire.
   * Client should re-fetch before this time.
   */
  readonly expiresAt?: number;

  /**
   * Partition columns (if table is partitioned).
   *
   * @example ['year', 'month']
   */
  readonly partitionColumns?: ReadonlyArray<string>;

  /**
   * Compression format used for files.
   *
   * @example 'snappy' | 'gzip' | 'lz4' | 'zstd'
   */
  readonly compression?: string;
}

// =============================================================================
// DATASOURCE RESPONSE
// =============================================================================

/**
 * Response from the DataSource API.
 *
 * This is returned by the Convex query that provides Parquet file metadata.
 * The client uses this to determine which files to download and when.
 */
export interface DataSourceResponse {
  /**
   * Table information for requested tables.
   */
  readonly tables: ReadonlyArray<DataSourceTableInfo>;

  /**
   * Optional metadata about the response.
   */
  readonly metadata?: DataSourceMetadata;
}

/**
 * Metadata about the data source response.
 */
export interface DataSourceMetadata {
  /**
   * Total size of all files (bytes).
   */
  readonly totalSize: number;

  /**
   * Estimated download time based on typical network speed.
   */
  readonly estimatedDownloadTimeMs?: number;

  /**
   * Server timestamp when response was generated.
   */
  readonly serverTimestamp?: number;

  /**
   * Any tables that were requested but not found.
   */
  readonly notFoundTables?: ReadonlyArray<string>;

  /**
   * Any tables that had errors.
   */
  readonly errorTables?: ReadonlyArray<{
    readonly name: string;
    readonly error: string;
  }>;
}

// =============================================================================
// DATASOURCE REQUEST
// =============================================================================

/**
 * Request to the DataSource API.
 */
export interface DataSourceRequest {
  /**
   * Tables to get information for.
   */
  readonly tables: ReadonlyArray<string>;

  /**
   * Whether to include schema information.
   * Default: true
   */
  readonly includeSchema?: boolean;

  /**
   * Whether to include partition information.
   * Default: false (reduces response size)
   */
  readonly includePartitions?: boolean;

  /**
   * Filter files by partition values.
   *
   * @example { year: '2024' }
   */
  readonly partitionFilter?: Readonly<Record<string, string>>;

  /**
   * Maximum age of files to include (for pruning old partitions).
   * In milliseconds from now.
   */
  readonly maxAge?: number;
}

// =============================================================================
// TYPE GUARDS
// =============================================================================

/**
 * Check if value is a valid DataSourceFileInfo.
 */
export const isDataSourceFileInfo = (value: unknown): value is DataSourceFileInfo => {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const obj = value as Record<string, unknown>;

  return (
    typeof obj['url'] === 'string' &&
    typeof obj['filename'] === 'string' &&
    typeof obj['size'] === 'number'
  );
};

/**
 * Check if value is a valid DataSourceTableInfo.
 */
export const isDataSourceTableInfo = (value: unknown): value is DataSourceTableInfo => {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const obj = value as Record<string, unknown>;

  return (
    typeof obj['name'] === 'string' &&
    Array.isArray(obj['files']) &&
    typeof obj['lastIngestedAt'] === 'number' &&
    typeof obj['totalRows'] === 'number' &&
    typeof obj['totalSize'] === 'number' &&
    typeof obj['schema'] === 'object'
  );
};

/**
 * Check if value is a valid DataSourceResponse.
 */
export const isDataSourceResponse = (value: unknown): value is DataSourceResponse => {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const obj = value as Record<string, unknown>;

  return Array.isArray(obj['tables']);
};

// =============================================================================
// UTILITIES
// =============================================================================

/**
 * Calculate total size of files in a table.
 */
export const calculateTableSize = (table: DataSourceTableInfo): number => {
  return table.files.reduce((sum, file) => sum + file.size, 0);
};

/**
 * Calculate total rows across tables.
 */
export const calculateTotalRows = (tables: ReadonlyArray<DataSourceTableInfo>): number => {
  return tables.reduce((sum, table) => sum + table.totalRows, 0);
};

/**
 * Calculate total size across tables.
 */
export const calculateTotalSize = (tables: ReadonlyArray<DataSourceTableInfo>): number => {
  return tables.reduce((sum, table) => sum + table.totalSize, 0);
};

/**
 * Get tables that need updating (lastIngestedAt > client's loadedAt).
 */
export const getTablesNeedingUpdate = (
  response: DataSourceResponse,
  clientLoadTimes: Readonly<Record<string, number>>
): ReadonlyArray<DataSourceTableInfo> => {
  return response.tables.filter((table) => {
    const clientLoadedAt = clientLoadTimes[table.name];
    if (!clientLoadedAt) {
      return true; // Never loaded
    }
    return table.lastIngestedAt > clientLoadedAt;
  });
};

/**
 * Check if any URLs in the response have expired.
 */
export const hasExpiredUrls = (response: DataSourceResponse): boolean => {
  const now = Date.now();
  return response.tables.some((table) => {
    if (table.expiresAt && table.expiresAt < now) {
      return true;
    }
    return false;
  });
};
