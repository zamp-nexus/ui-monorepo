/**
 * Table Sync Service
 *
 * Fetches table metadata from Convex datasource API
 * and compares with local metadata to determine sync needs.
 *
 * @module analytics-sync/table-sync-service
 */

import type { ConvexReactClient } from 'convex/react';

import {
  isDataSourceResponse,
  type DataSourceFileInfo,
  type DataSourceResponse,
  type DataSourceTableInfo,
} from '@open-insights-web/foundation-data-model';
import { createDebugLogger, type Logger } from '@open-insights-web/foundation-utils';

import type { ConvexQueryReference } from '../core/types';

/**
 * Local table metadata stored in IndexedDB.
 *
 * This interface mirrors `TableSyncMetadataEntry` from foundation-database.
 * It is defined here to avoid importing from a non-public internal path.
 * If foundation-database exports this type from its main index in the future,
 * this alias should be replaced with a direct import.
 */
export interface LocalTableMetadata {
  readonly name: string;
  readonly lastIngestedAt: number;
  readonly loadedAt: number;
  readonly fileHashes: Record<string, string>;
  readonly totalSize: number;
  readonly totalRows: number;
}

/**
 * Plan for updating a single table
 */
export interface TableUpdatePlan {
  readonly tableName: string;
  readonly needsUpdate: boolean;
  readonly filesToDownload: ReadonlyArray<DataSourceFileInfo>;
  readonly remoteInfo: DataSourceTableInfo;
}

/**
 * Database operations interface for table sync metadata
 */
export interface TableSyncDatabaseOperations {
  get(tableName: string): Promise<LocalTableMetadata | undefined>;
  set(entry: LocalTableMetadata): Promise<void>;
  getMany(tableNames: string[]): Promise<Map<string, LocalTableMetadata | undefined>>;
}

/**
 * Table Sync Service Configuration
 */
export interface TableSyncServiceConfig {
  readonly convexClient: ConvexReactClient;
  readonly datasourceApi: ConvexQueryReference | null;
  readonly database: TableSyncDatabaseOperations;
  readonly debug?: boolean;
}

/**
 * Table Sync Service
 */
export class TableSyncService {
  private readonly convexClient: ConvexReactClient;
  private readonly datasourceApi: ConvexQueryReference | null;
  private readonly database: TableSyncDatabaseOperations;
  private readonly logger: Logger;

  constructor(config: TableSyncServiceConfig) {
    this.convexClient = config.convexClient;
    this.datasourceApi = config.datasourceApi;
    this.database = config.database;
    this.logger = createDebugLogger('TableSyncService', config.debug ?? false);
  }

  /**
   * Check if service is configured (has datasource API)
   */
  isConfigured = (): boolean => {
    return this.datasourceApi !== null;
  };

  /**
   * Fetch table info from Convex datasource.list API (batch)
   */
  fetchTablesInfo = async (tables: ReadonlyArray<string>): Promise<DataSourceResponse> => {
    if (!this.datasourceApi) {
      throw new Error('No datasource API configured. Set datasourceApi in DataLayerConfig.');
    }

    this.logger.debug('Fetching table info for:', tables);

    const response = await this.convexClient.query(this.datasourceApi, {
      tables: [...tables],
    });

    if (!isDataSourceResponse(response)) {
      throw new Error('Datasource API returned an invalid response shape.');
    }

    this.logger.debug('Received table info:', response);
    return response;
  };

  /**
   * Get local metadata for a table
   */
  getLocalMetadata = async (tableName: string): Promise<LocalTableMetadata | undefined> => {
    return this.database.get(tableName);
  };

  /**
   * Get local metadata for multiple tables
   */
  getLocalMetadataForTables = async (
    tables: ReadonlyArray<string>,
  ): Promise<Map<string, LocalTableMetadata | undefined>> => {
    return this.database.getMany([...tables]);
  };

  /**
   * Determine if a table needs update based on timestamps
   */
  needsUpdate = (remote: DataSourceTableInfo, local: LocalTableMetadata | undefined): boolean => {
    if (!local) {
      this.logger.debug(`Table ${remote.name} needs update: never synced`);
      return true;
    }

    const needsUpdate = remote.lastIngestedAt > local.lastIngestedAt;

    if (needsUpdate) {
      this.logger.debug(
        `Table ${remote.name} needs update:`,
        `remote.lastIngestedAt=${remote.lastIngestedAt}`,
        `> local.lastIngestedAt=${local.lastIngestedAt}`,
      );
    }

    return needsUpdate;
  };

  /**
   * Get files that need downloading (by hash comparison)
   */
  getFilesToDownload = (
    remote: DataSourceTableInfo,
    local: LocalTableMetadata | undefined,
  ): ReadonlyArray<DataSourceFileInfo> => {
    if (!local) {
      this.logger.debug(`Table ${remote.name}: downloading all ${remote.files.length} files`);
      return remote.files;
    }

    const filesToDownload = remote.files.filter((file) => {
      const localHash = local.fileHashes[file.filename];
      return !localHash || localHash !== file.hash;
    });

    this.logger.debug(
      `Table ${remote.name}: ${filesToDownload.length}/${remote.files.length} files need download`,
    );

    return filesToDownload;
  };

  /**
   * Analyze which tables need updates and which files to download
   */
  analyzeUpdates = (
    response: DataSourceResponse,
    localMetadata: Map<string, LocalTableMetadata | undefined>,
  ): TableUpdatePlan[] => {
    return response.tables
      .map((remoteTable): TableUpdatePlan => {
        const local = localMetadata.get(remoteTable.name);
        const needsUpdate = this.needsUpdate(remoteTable, local);
        const filesToDownload = needsUpdate ? this.getFilesToDownload(remoteTable, local) : [];

        return {
          tableName: remoteTable.name,
          needsUpdate,
          filesToDownload,
          remoteInfo: remoteTable,
        };
      })
      .filter((plan) => plan.needsUpdate && plan.filesToDownload.length > 0);
  };

  /**
   * Create metadata entry from remote data
   */
  createLocalMetadata = (tableName: string, info: DataSourceTableInfo): LocalTableMetadata => {
    const fileHashes: Record<string, string> = {};
    for (const file of info.files) {
      if (file.hash) {
        fileHashes[file.filename] = file.hash;
      }
    }

    return {
      name: tableName,
      lastIngestedAt: info.lastIngestedAt,
      loadedAt: Date.now(),
      fileHashes,
      totalSize: info.totalSize,
      totalRows: info.totalRows,
    };
  };

  /**
   * Persist updated local metadata
   */
  updateLocalMetadata = async (tableName: string, info: DataSourceTableInfo): Promise<void> => {
    const metadata = this.createLocalMetadata(tableName, info);
    await this.database.set(metadata);
    this.logger.debug(`Updated local metadata for table ${tableName}`);
  };
}
