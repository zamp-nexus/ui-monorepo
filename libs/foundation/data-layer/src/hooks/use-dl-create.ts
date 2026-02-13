/**
 * useDLCreate - Create mutation with local-first optimistic updates
 *
 * Implements the pattern:
 * 1. Optimistically update TanStack cache
 * 2. Queue mutation via SyncCoordinator (foundation-sync-engine)
 * 3. On success: confirm cache, update with server ID
 * 4. On failure: rollback cache
 *
 * @module hooks/use-dl-create
 */

import { useCallback, useRef, useState } from 'react';
import { useMutation, type QueryKey } from '@tanstack/react-query';
import { useConvexMutation } from '@convex-dev/react-query';
import type { FunctionReference, FunctionArgs, FunctionReturnType } from 'convex/server';
import {
  generateProvisionalId,
  hashQueryKey,
  SCHEMA_VERSION,
  toJsonSerializable,
} from '@open-insights-web/foundation-data-model';
import { createCacheEntry } from '@open-insights-web/foundation-database';
import { createScopedErrorHandler } from '../utils/error-handler';
import {
  type OptimisticContext,
  optimisticAddToList,
  rollbackOptimisticUpdate,
  replaceProvisionalId,
} from '../utils/optimistic-updates';
import { buildMutationResult } from '../utils/mutation-helpers';
import { DEFAULT_CACHE_TTL } from '../core/constants';
import {
  useMutationInternals,
  useQueueState,
  createOnSuccessCallback,
  createOnSettledCallback,
  createOnErrorCallback,
} from '../utils/use-mutation-internals';
import type { WithId } from '@open-insights-web/foundation-data-model';
import type { BaseMutationOptions, DLMutationResult, OptimisticMetadata } from '../core/types';

// Scoped error handler for this hook
const handleCreateError = createScopedErrorHandler('useDLCreate');

const getResultEntityId = (result: unknown): string | null => {
  if (result === null || typeof result !== 'object') {
    return null;
  }

  const resultRecord = result as Record<string, unknown>;
  if (typeof resultRecord.id === 'string') {
    return resultRecord.id;
  }
  if (typeof resultRecord._id === 'string') {
    return resultRecord._id;
  }
  return null;
};

// =============================================================================
// Types
// =============================================================================

/**
 * Options for useDLCreate hook
 */
export interface UseDLCreateOptions<
  TMutation extends FunctionReference<'mutation'>,
  TData = FunctionReturnType<TMutation>,
  TVariables extends FunctionArgs<TMutation> = FunctionArgs<TMutation>,
> extends BaseMutationOptions<TMutation, TData, TVariables> {
  /** Generate optimistic data from variables */
  onOptimistic: (variables: TVariables) => TData;
  /** Query key of the list to optimistically update */
  listQueryKey?: QueryKey;
}

/**
 * Create mutation hook with local-first optimistic updates
 *
 * Uses foundation-database for caching and foundation-sync-engine for offline queueing.
 *
 * @example
 * ```tsx
 * const createUser = useDLCreate({
 *   mutation: api.users.create,
 *   table: 'users',
 *   onOptimistic: (vars) => ({
 *     ...vars,
 *     id: generateProvisionalId(),
 *     createdAt: new Date().toISOString(),
 *   }),
 *   listQueryKey: ['users'],
 * });
 *
 * // Usage
 * createUser.mutate({ name: 'John', email: 'john@example.com' });
 * ```
 */
export const useDLCreate = <
  TMutation extends FunctionReference<'mutation'>,
  TData = FunctionReturnType<TMutation>,
  TVariables extends FunctionArgs<TMutation> = FunctionArgs<TMutation>,
>(
  options: UseDLCreateOptions<TMutation, TData, TVariables>
): DLMutationResult<TData, TVariables> => {
  // Use shared mutation internals
  const internals = useMutationInternals();
  const { queryClient, database, queueManager, isOnline } = internals;

  // Use shared state
  const { isQueued, setIsQueued } = useQueueState();

  // Track optimistic context for rollback
  const optimisticContextRef = useRef<OptimisticContext<WithId[]> | null>(null);

  // Track provisional ID - needs to be state for re-renders and ref for closure access
  const [provisionalId, setProvisionalId] = useState<string | null>(null);
  const provisionalIdRef = useRef<string | null>(null);

  const {
    mutation,
    table,
    onOptimistic,
    listQueryKey,
    invalidateKeys = [],
    onSuccess,
    onError,
    onSettled,
  } = options;

  // Get Convex mutation function
  const convexMutation = useConvexMutation(mutation);

  // Mutation function
  const mutationFn = useCallback(
    async (variables: TVariables): Promise<TData> => {
      // Generate provisional ID for optimistic data
      const newProvisionalId = generateProvisionalId();
      setProvisionalId(newProvisionalId);
      provisionalIdRef.current = newProvisionalId;

      // Create optimistic data with sync metadata
      const optimisticData = onOptimistic(variables);
      const optimisticWithId = {
        ...optimisticData,
        id: newProvisionalId,
        _id: newProvisionalId,
        _isPendingSync: true,
        _provisionalId: newProvisionalId,
        _createdLocallyAt: Date.now(),
      } as TData & WithId & OptimisticMetadata;

      // Step 1: Optimistically update TanStack cache
      if (listQueryKey) {
        optimisticContextRef.current = optimisticAddToList(
          queryClient,
          listQueryKey,
          optimisticWithId
        );
      }

      // Step 2: Persist optimistic data to DatabaseFacade
      // Convert to JsonSerializable with validation (Convex data is always JSON-serializable)
      const cacheKey = hashQueryKey([table, newProvisionalId]);
      const serializedData = toJsonSerializable(optimisticWithId);
      const entry = createCacheEntry(cacheKey, [table, newProvisionalId], serializedData, {
        tableName: table,
        ttl: DEFAULT_CACHE_TTL,
        schemaVersion: SCHEMA_VERSION,
        isOfflineData: true,
      });
      await database.queries.set(entry);

      // Step 3: If offline, queue mutation via sync-engine's queue manager
      if (!isOnline) {
        setIsQueued(true);

        // Convert payload and optimistic data with validation
        await queueManager.enqueue({
          type: 'create',
          tableName: table,
          entityId: newProvisionalId,
          payload: toJsonSerializable(variables),
          optimisticData: serializedData,
          invalidateKeys: invalidateKeys.map((key) => JSON.stringify(key)),
        });

        // Return optimistic data when offline
        return optimisticWithId as TData;
      }

      // Step 4: Online - execute Convex mutation
      setIsQueued(false);
      const result = await convexMutation(variables);

      // Extract server ID from result
      const serverId = getResultEntityId(result) ?? newProvisionalId;

      // Step 5: Update cache with server ID
      if (serverId !== newProvisionalId) {
        // Update the optimistic data in database to remove sync metadata
        const finalData = {
          ...result,
          _isPendingSync: false,
          _provisionalId: undefined,
          _createdLocallyAt: undefined,
        };
        const serverCacheKey = hashQueryKey([table, serverId]);
        const serverEntry = createCacheEntry(
          serverCacheKey,
          [table, serverId],
          toJsonSerializable(finalData),
          {
            tableName: table,
            ttl: DEFAULT_CACHE_TTL,
            schemaVersion: SCHEMA_VERSION,
            isOfflineData: false,
          }
        );
        await database.queries.set(serverEntry);

        // Remove old provisional entry
        await database.queries.delete(cacheKey);

        // Update cache with server ID
        if (listQueryKey) {
          replaceProvisionalId(queryClient, listQueryKey, newProvisionalId, serverId);
        }
      }

      return result;
    },
    [
      convexMutation,
      database,
      invalidateKeys,
      isOnline,
      listQueryKey,
      onOptimistic,
      queryClient,
      queueManager,
      setIsQueued,
      table,
    ]
  );

  // Create shared callbacks
  const handleSuccess = createOnSuccessCallback({
    internals,
    invalidateKeys,
    listQueryKey,
    entityIdRef: provisionalIdRef,
    onSuccess,
  });

  const clearRefs = useCallback(() => {
    optimisticContextRef.current = null;
  }, []);

  const handleSettled = createOnSettledCallback({
    clearRefs,
    onSettled,
  });

  // Dummy item context ref (create only has list context)
  const dummyItemContextRef = useRef<null>(null);

  // Additional error handling: remove from database if not queued
  const cleanupOnError = async (): Promise<void> => {
    const currentProvisionalId = provisionalIdRef.current;
    if (currentProvisionalId && !isQueued) {
      const cacheKey = hashQueryKey([table, currentProvisionalId]);
      await database.queries.delete(cacheKey);
    }
  };

  // Create shared error handler using utility
  const handleError = createOnErrorCallback<TData, TVariables, WithId, null>({
    internals,
    listContextRef: optimisticContextRef,
    itemContextRef: dummyItemContextRef,
    rollbackFn: rollbackOptimisticUpdate,
    errorHandler: handleCreateError,
    table,
    additionalErrorHandling: cleanupOnError,
    onError,
  });

  // TanStack mutation
  const mutationResult = useMutation<TData, Error, TVariables>({
    mutationFn,

    onSuccess: handleSuccess,

    onError: handleError,

    onSettled: handleSettled,
  });

  return buildMutationResult({
    mutationResult,
    isQueued,
    provisionalId,
    isOffline: !isOnline,
  });
};
