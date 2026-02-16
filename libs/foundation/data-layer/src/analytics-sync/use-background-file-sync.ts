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

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { createDebugLogger } from '@open-insights-web/foundation-utils';

import { useDataLayerInternals } from '../provider/data-layer-internals-context';
import { INITIAL_DOWNLOAD_STATE, type DownloadProgressState } from './file-download-service';

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
  options: UseBackgroundFileSyncOptions,
): UseBackgroundFileSyncResult => {
  const { tables, enabled = true, onProgress, onComplete, onError, debug = false } = options;

  const { queryClient, datasourceApi, getTableSyncService, getFileDownloadService } =
    useDataLayerInternals();
  const [state, setState] = useState<BackgroundSyncState>(INITIAL_SYNC_STATE);
  const isSyncingRef = useRef(false);
  const abortControllerRef = useRef<AbortController | null>(null);

  const logger = useMemo(() => createDebugLogger('useBackgroundFileSync', debug), [debug]);

  const isConfigured = datasourceApi !== null;

  const triggerSync = useCallback(async (): Promise<void> => {
    if (!enabled || tables.length === 0 || !datasourceApi) {
      logger.debug('Sync skipped: not configured or disabled');
      return;
    }

    if (isSyncingRef.current) {
      logger.debug('Sync skipped: already in progress');
      return;
    }

    isSyncingRef.current = true;
    const controller = new AbortController();
    abortControllerRef.current = controller;
    setState((previousState) => ({ ...previousState, isChecking: true, error: null }));

    try {
      const syncService = getTableSyncService();
      logger.debug('Fetching table info for:', tables);
      const response = await syncService.fetchTablesInfo(tables);

      const localMetadata = await syncService.getLocalMetadataForTables(tables);
      const updatePlans = syncService.analyzeUpdates(response, localMetadata);

      if (updatePlans.length === 0) {
        logger.debug('No updates needed');
        setState((previousState) => ({
          ...previousState,
          isChecking: false,
          isDownloading: false,
          downloadProgress: INITIAL_DOWNLOAD_STATE,
          lastSyncedAt: Date.now(),
        }));
        return;
      }

      const tablesToUpdate = updatePlans.map((plan) => plan.tableName);
      logger.debug('Tables needing update:', tablesToUpdate);

      setState((previousState) => ({
        ...previousState,
        isDownloading: true,
        tablesNeedingUpdate: tablesToUpdate,
      }));

      const downloadService = await getFileDownloadService();
      if (!downloadService) {
        const opfsError = new Error(
          'Background sync unavailable: OPFS manager could not be initialized.',
        );
        setState((previousState) => ({
          ...previousState,
          isChecking: false,
          isDownloading: false,
          error: opfsError,
        }));
        onError?.(opfsError);
        return;
      }

      const totalFiles = updatePlans.reduce((sum, plan) => sum + plan.filesToDownload.length, 0);
      let filesCompleted = 0;

      for (const plan of updatePlans) {
        await downloadService.downloadAndSaveFiles(
          plan.tableName,
          plan.filesToDownload,
          (progress) => {
            const overallProgress: DownloadProgressState = {
              ...progress,
              filesTotal: totalFiles,
              filesCompleted: filesCompleted + progress.filesCompleted,
              progress: ((filesCompleted + progress.filesCompleted) / totalFiles) * 100,
            };

            setState((previousState) => ({ ...previousState, downloadProgress: overallProgress }));
            onProgress?.(overallProgress);
          },
          controller.signal,
        );

        filesCompleted += plan.filesToDownload.length;
        await syncService.updateLocalMetadata(plan.tableName, plan.remoteInfo);
      }

      if (controller.signal.aborted) {
        logger.debug('Sync aborted');
        setState((previousState) => ({
          ...previousState,
          isChecking: false,
          isDownloading: false,
          downloadProgress: INITIAL_DOWNLOAD_STATE,
        }));
        return;
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
      if (controller.signal.aborted) {
        logger.debug('Sync aborted by signal');
        setState((previousState) => ({
          ...previousState,
          isChecking: false,
          isDownloading: false,
          downloadProgress: INITIAL_DOWNLOAD_STATE,
          error: null,
        }));
        return;
      }

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
      if (abortControllerRef.current === controller) {
        abortControllerRef.current = null;
      }
    }
  }, [
    enabled,
    tables,
    datasourceApi,
    getTableSyncService,
    getFileDownloadService,
    queryClient,
    onProgress,
    onComplete,
    onError,
    logger,
  ]);

  useEffect(() => {
    if (enabled && datasourceApi && tables.length > 0) {
      void triggerSync();
    }
  }, [enabled, datasourceApi, tables, triggerSync]);

  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort();
      abortControllerRef.current = null;
    };
  }, []);

  return {
    ...state,
    triggerSync,
    isConfigured,
  };
};
