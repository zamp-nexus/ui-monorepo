/**
 * useSyncStatus - Hook for monitoring sync status
 *
 * Provides real-time sync status from the SyncCoordinator (foundation-sync-engine).
 * Includes online status, syncing state, pending count, and leader election info.
 *
 * @module hooks/use-sync-status
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { SyncEventType, type SyncEvent } from '@open-insights-web/foundation-data-model';
import { useCallbackRef } from '@open-insights-web/foundation-hooks';
import { useDataLayerInternals } from '../provider/data-layer-internals-context';
import { createScopedErrorHandler } from '../utils/error-handler';

// =============================================================================
// Types
// =============================================================================

/**
 * Sync status information
 */
export interface SyncStatus {
  /** Whether the client is online */
  readonly isOnline: boolean;
  /** Whether a sync is in progress */
  readonly isSyncing: boolean;
  /** Number of pending mutations in the queue */
  readonly pendingCount: number;
  /** Number of failed mutations */
  readonly failedCount: number;
  /** Timestamp of the last successful sync */
  readonly lastSyncedAt: number | null;
  /** Whether this tab is the leader (handles sync) */
  readonly isLeader: boolean;
}

// Create scoped error handler for this hook
const handleSyncStatusError = createScopedErrorHandler('useSyncStatus');

/**
 * Type guard for leader-changed event data
 */
interface LeaderChangedEventData {
  readonly isLeader: boolean;
}

const isLeaderChangedEventData = (data: unknown): data is LeaderChangedEventData =>
  data !== null &&
  typeof data === 'object' &&
  'isLeader' in data &&
  typeof (data as { isLeader?: unknown }).isLeader === 'boolean';

/**
 * Hook for monitoring sync status
 *
 * Provides reactive sync status updates from the SyncCoordinator.
 *
 * @example
 * ```tsx
 * const {
 *   isOnline,
 *   isSyncing,
 *   pendingCount,
 *   failedCount,
 *   lastSyncedAt,
 *   isLeader
 * } = useSyncStatus();
 *
 * // Show sync indicator
 * if (isSyncing) {
 *   return <SyncingSpinner />;
 * }
 *
 * // Show offline badge
 * if (!isOnline) {
 *   return <OfflineBadge pendingCount={pendingCount} />;
 * }
 * ```
 */
export const useSyncStatus = (): SyncStatus => {
  const { syncCoordinator, isOnline } = useDataLayerInternals();

  const [status, setStatus] = useState<SyncStatus>({
    isOnline,
    isSyncing: false,
    pendingCount: 0,
    failedCount: 0,
    lastSyncedAt: null,
    isLeader: false,
  });

  // Update status from sync events - wrapped in mounted check via closure
  const handleSyncEvent = useCallback((event: SyncEvent, mounted: boolean) => {
    if (!mounted) return;
    
    switch (event.type) {
      case SyncEventType.ONLINE:
        setStatus((prev) => ({ ...prev, isOnline: true }));
        break;
      case SyncEventType.OFFLINE:
        setStatus((prev) => ({ ...prev, isOnline: false }));
        break;
      case SyncEventType.SYNC_START:
        setStatus((prev) => ({ ...prev, isSyncing: true }));
        break;
      case SyncEventType.SYNC_COMPLETE:
        setStatus((prev) => ({
          ...prev,
          isSyncing: false,
          lastSyncedAt: event.timestamp,
        }));
        break;
      case SyncEventType.SYNC_ERROR:
        setStatus((prev) => ({ ...prev, isSyncing: false }));
        break;
      case SyncEventType.LEADER_CHANGED:
        if (isLeaderChangedEventData(event.data)) {
          // Capture value before closure to preserve type narrowing
          const newIsLeader = event.data.isLeader;
          setStatus((prev) => ({
            ...prev,
            isLeader: newIsLeader,
          }));
        }
        break;
    }
  }, []);

  // Subscribe to sync coordinator events with proper async cleanup
  useEffect(() => {
    let mounted = true;

    // Get initial state with mounted check
    const loadInitialState = async () => {
      try {
        const state = await syncCoordinator.getState();
        
        // Only update state if component is still mounted
        if (!mounted) return;
        
        setStatus({
          isOnline: state.isOnline,
          isSyncing: state.isSyncing,
          pendingCount: state.pendingMutations,
          failedCount: state.failedMutations,
          lastSyncedAt: state.lastSyncAt,
          isLeader: state.isLeader,
        });
      } catch (error) {
        // Log but don't crash - status will be updated via events
        if (mounted) {
          handleSyncStatusError(error);
        }
      }
    };

    loadInitialState();

    // Subscribe to events with mounted check in handler
    const unsubscribe = syncCoordinator.subscribe((event) => {
      handleSyncEvent(event, mounted);
    });

    return () => {
      mounted = false;
      unsubscribe();
    };
  }, [syncCoordinator, handleSyncEvent]);

  // Keep isOnline in sync with context
  useEffect(() => {
    setStatus((prev) => ({ ...prev, isOnline }));
  }, [isOnline]);

  return status;
};

/**
 * Hook to trigger manual sync
 *
 * @example
 * ```tsx
 * const { sync, isSyncing } = useSyncTrigger();
 *
 * <button onClick={sync} disabled={isSyncing}>
 *   {isSyncing ? 'Syncing...' : 'Sync Now'}
 * </button>
 * ```
 */
export const useSyncTrigger = (): {
  /** Trigger a manual sync. No-op if already syncing. */
  readonly sync: () => Promise<void>;
  /** Whether a sync is currently in progress */
  readonly isSyncing: boolean;
} => {
  const { syncCoordinator } = useDataLayerInternals();
  const [isSyncing, setIsSyncing] = useState(false);
  
  // Track mounted state for async cleanup
  const mountedRef = useRef(true);
  
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const sync = useCallback(async () => {
    if (isSyncing) return;

    setIsSyncing(true);
    try {
      await syncCoordinator.sync();
    } finally {
      // Only update state if still mounted
      if (mountedRef.current) {
        setIsSyncing(false);
      }
    }
  }, [syncCoordinator, isSyncing]);

  return { sync, isSyncing };
};

/**
 * Hook for listening to specific sync events
 *
 * @example
 * ```tsx
 * useSyncEventListener('sync-complete', (event) => {
 *   console.log('Sync completed at:', event.timestamp);
 *   toast.success('Data synced successfully!');
 * });
 * ```
 */
export const useSyncEventListener = (
  eventType: SyncEvent['type'],
  callback: (event: SyncEvent) => void
): void => {
  const { syncCoordinator } = useDataLayerInternals();
  
  // Use stable callback ref to avoid re-subscription when callback changes
  // This prevents memory leaks from rapid re-subscriptions
  const stableCallback = useCallbackRef(callback);

  useEffect(() => {
    const unsubscribe = syncCoordinator.subscribe((event) => {
      if (event.type === eventType) {
        stableCallback(event);
      }
    });

    return () => {
      unsubscribe();
    };
  }, [syncCoordinator, eventType, stableCallback]);
};
