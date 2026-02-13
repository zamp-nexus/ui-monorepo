/**
 * useBackgroundFileSync Hook
 *
 * Orchestrates background file synchronization:
 * 1. Fetches table info from Convex datasource.list API
 * 2. Compares with local metadata to find tables needing updates
 * 3. Downloads parquet files to OPFS
 * 4. Updates local metadata
 * 5. Invalidates queries to trigger re-fetch with new data
 *
 * @module analytics-sync/use-background-file-sync
 */

import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { createDebugLogger } from '@open-insights-web/foundation-utils';
import { useDataLayerInternals } from '../provider';
import {
  TableSyncService,
  type LocalTableMetadata,
  type TableSyncDatabaseOperations,
} from './table-sync-service';
import {
  FileDownloadService,
  type DownloadProgressState,
  INITIAL_DOWNLOAD_STATE,
} from './file-download-service';


/**
 * Options for useBackgroundFileSync hook
 */
export interface UseBackgroundFileSyncOptions {
  readonly tables: ReadonlyArray<string>;
  readonly enabled?: boolean;
  readonly onProgress?: (progress: DownloadProgressState) => void;
  readonly onComplete?: (updatedTables: string[]) => void;
  readonly onError?: (error: Error) => void;
  readonly debug?: boolean;
}

/**
 * Background sync state
 */
export interface BackgroundSyncState {
  readonly isChecking: boolean;
  readonly isDownloading: boolean;
  readonly downloadProgress: DownloadProgressState;
  readonly tablesNeedingUpdate: ReadonlyArray<string>;
  readonly lastSyncedAt: number | null;
  readonly error: Error | null;
}

/**
 * Result from useBackgroundFileSync hook
 */
export interface UseBackgroundFileSyncResult extends BackgroundSyncState {
  readonly triggerSync: () => Promise<void>;
  readonly isConfigured: boolean;
}

const INITIAL_SYNC_STATE: BackgroundSyncState = Object.freeze({
  isChecking: false,
  isDownloading: false,
  downloadProgress: INITIAL_DOWNLOAD_STATE,
  tablesNeedingUpdate: [],
  lastSyncedAt: null,
  error: null,
});

/**
 * Background file sync hook for analytics tables.
 */
export const useBackgroundFileSync = (
  options: UseBackgroundFileSyncOptions
): UseBackgroundFileSyncResult => {
  const { tables, enabled = true, onProgress, onComplete, onError, debug = false } = options;

  const { convexClient, database, queryClient, datasourceApi, opfsManager } = useDataLayerInternals();
  const [state, setState] = useState<BackgroundSyncState>(INITIAL_SYNC_STATE);
  const isSyncingRef = useRef(false);

  const logger = useMemo(
    () => createDebugLogger('useBackgroundFileSync', debug),
    [debug]
  );

  const databaseOperations = useMemo((): TableSyncDatabaseOperations => {
    return {
      get: async (tableName: string): Promise<LocalTableMetadata | undefined> => {
        const entry = await database.getDatabase().tableSyncMetadata.get(tableName);
        if (!entry) {
          return undefined;
        }

        return {
          name: entry.name,
          lastIngestedAt: entry.lastIngestedAt,
          loadedAt: entry.loadedAt,
          fileHashes: entry.fileHashes,
          totalSize: entry.totalSize,
          totalRows: entry.totalRows,
        };
      },
      set: async (entry: LocalTableMetadata): Promise<void> => {
        await database.getDatabase().tableSyncMetadata.put(entry);
      },
      getMany: async (
        tableNames: string[]
      ): Promise<Map<string, LocalTableMetadata | undefined>> => {
        const result = new Map<string, LocalTableMetadata | undefined>();
        const entries = await database.getDatabase().tableSyncMetadata.bulkGet(tableNames);

        for (let index = 0; index < tableNames.length; index++) {
          const entry = entries[index];
          result.set(
            tableNames[index],
            entry
              ? {
                  name: entry.name,
                  lastIngestedAt: entry.lastIngestedAt,
                  loadedAt: entry.loadedAt,
                  fileHashes: entry.fileHashes,
                  totalSize: entry.totalSize,
                  totalRows: entry.totalRows,
                }
              : undefined
          );
        }

        return result;
      },
    };
  }, [database]);

  const syncService = useMemo(
    () =>
      new TableSyncService({
        convexClient,
        datasourceApi,
        database: databaseOperations,
        debug,
      }),
    [convexClient, datasourceApi, databaseOperations, debug]
  );

  // Memoize download service to avoid recreation on every triggerSync call
  const downloadService = useMemo(
    () =>
      opfsManager
        ? new FileDownloadService({
            opfsManager,
            debug,
          })
        : null,
    [opfsManager, debug]
  );

  const isConfigured = datasourceApi !== null && opfsManager !== null;

  const triggerSync = useCallback(async (): Promise<void> => {
    if (!enabled || tables.length === 0 || !datasourceApi || !opfsManager) {
      logger.debug('Sync skipped: not configured or disabled');
      return;
    }

    if (isSyncingRef.current) {
      logger.debug('Sync skipped: already in progress');
      return;
    }

    isSyncingRef.current = true;
    setState((previousState) => ({ ...previousState, isChecking: true, error: null }));

    try {
      logger.debug('Fetching table info for:', tables);
      const response = await syncService.fetchTablesInfo(tables);

      const localMetadata = await syncService.getLocalMetadataForTables(tables);
      const updatePlans = syncService.analyzeUpdates(response, localMetadata);

      if (updatePlans.length === 0) {
        logger.debug('No updates needed');
        setState((previousState) => ({
          ...previousState,
          isChecking: false,
          lastSyncedAt: Date.now(),
        }));
        isSyncingRef.current = false;
        return;
      }

      const tablesToUpdate = updatePlans.map((plan) => plan.tableName);
      logger.debug('Tables needing update:', tablesToUpdate);

      setState((previousState) => ({
        ...previousState,
        isDownloading: true,
        tablesNeedingUpdate: tablesToUpdate,
      }));

      if (!downloadService) {
        logger.debug('Sync skipped: download service not available');
        return;
      }

      const totalFiles = updatePlans.reduce((sum, plan) => sum + plan.filesToDownload.length, 0);
      let filesCompleted = 0;

      for (const plan of updatePlans) {
        await downloadService.downloadAndSaveFiles(plan.tableName, plan.filesToDownload, (progress) => {
          const overallProgress: DownloadProgressState = {
            ...progress,
            filesTotal: totalFiles,
            filesCompleted: filesCompleted + progress.filesCompleted,
            progress: ((filesCompleted + progress.filesCompleted) / totalFiles) * 100,
          };

          setState((previousState) => ({ ...previousState, downloadProgress: overallProgress }));
          onProgress?.(overallProgress);
        });

        filesCompleted += plan.filesToDownload.length;
        await syncService.updateLocalMetadata(plan.tableName, plan.remoteInfo);
      }

      logger.debug('Invalidating queries');
      await queryClient.invalidateQueries({
        queryKey: ['analytics'],
        refetchType: 'active',
      });

      const now = Date.now();
      setState((previousState) => ({
        ...previousState,
        isChecking: false,
        isDownloading: false,
        lastSyncedAt: now,
        downloadProgress: INITIAL_DOWNLOAD_STATE,
      }));

      logger.debug('Sync completed for:', tablesToUpdate);
      onComplete?.(tablesToUpdate);
    } catch (error) {
      const syncError = error instanceof Error ? error : new Error(String(error));
      logger.debug('Sync error:', syncError);

      setState((previousState) => ({
        ...previousState,
        isChecking: false,
        isDownloading: false,
        error: syncError,
      }));

      onError?.(syncError);
    } finally {
      isSyncingRef.current = false;
    }
  }, [
    enabled,
    tables,
    datasourceApi,
    opfsManager,
    downloadService,
    syncService,
    queryClient,
    onProgress,
    onComplete,
    onError,
    logger,
  ]);

  useEffect(() => {
    if (enabled && datasourceApi && opfsManager && tables.length > 0) {
      void triggerSync();
    }
  }, [enabled, datasourceApi, opfsManager, tables, triggerSync]);

  return {
    ...state,
    triggerSync,
    isConfigured,
  };
};

