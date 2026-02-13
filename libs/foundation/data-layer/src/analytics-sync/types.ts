/**
 * Analytics Sync Types
 *
 * Types for datasource responses used by background parquet synchronization.
 *
 * @module analytics-sync/types
 */

/**
 * Information about a single datasource file.
 */
export interface DataSourceFileInfo {
  readonly url: string;
  readonly filename: string;
  readonly size: number;
  readonly rowCount?: number;
  readonly hash?: string;
  readonly partition?: Readonly<Record<string, string>>;
}

/**
 * Information about table data exposed by datasource API.
 */
export interface DataSourceTableInfo {
  readonly name: string;
  readonly files: ReadonlyArray<DataSourceFileInfo>;
  readonly lastIngestedAt: number;
  readonly totalRows: number;
  readonly totalSize: number;
  readonly schema: Readonly<Record<string, string>>;
  readonly expiresAt?: number;
  readonly partitionColumns?: ReadonlyArray<string>;
  readonly compression?: string;
}

/**
 * Batch response from datasource API.
 */
export interface DataSourceResponse {
  readonly tables: ReadonlyArray<DataSourceTableInfo>;
  readonly metadata?: {
    readonly totalSize: number;
    readonly estimatedDownloadTimeMs?: number;
    readonly serverTimestamp?: number;
    readonly notFoundTables?: ReadonlyArray<string>;
    readonly errorTables?: ReadonlyArray<{
      readonly name: string;
      readonly error: string;
    }>;
  };
}

