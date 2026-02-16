/**
 * useDLDelete - Delete mutation with optimistic removal
 *
 * Implements local-first optimistic deletion pattern.
 * Uses foundation-database for caching and foundation-sync-engine for offline queueing.
 *
 * @module hooks/use-dl-delete
 */

import { useCallback } from 'react';

import { useConvexMutation } from '@convex-dev/react-query';
import { useMutation, type QueryKey } from '@tanstack/react-query';
import type { FunctionArgs, FunctionReference, FunctionReturnType } from 'convex/server';

import {
  hashQueryKey,
  SCHEMA_VERSION,
  toJsonSerializable,
} from '@open-insights-web/foundation-data-model';
import type { WithId } from '@open-insights-web/foundation-data-model';
import { createCacheEntry } from '@open-insights-web/foundation-database';

import { DEFAULT_CACHE_TTL } from '../core/constants';
import type { BaseMutationOptions, DLMutationResult } from '../core/types';
import { createScopedErrorHandler } from '../utils/error-handler';
import {
  buildMutationResult,
  deleteFromCache,
  executeLocalFirstMutation,
} from '../utils/mutation-helpers';
import {
  createOptimisticContext,
  optimisticRemoveFromList,
  rollbackOptimisticUpdate,
} from '../utils/optimistic-updates';
import {
  createOnErrorCallback,
  createOnSettledCallback,
  createOnSuccessCallback,
  prepareResolvedVariables,
  resolveEntityId,
  useMutationInternals,
  useOptimisticContextRefs,
  useQueueState,
} from '../utils/use-mutation-internals';

// Scoped error handler for this hook
const handleDeleteError = createScopedErrorHandler('useDLDelete');

// =============================================================================
// Types
// =============================================================================

/**
 * Options for useDLDelete hook
 */
export interface UseDLDeleteOptions<
  TMutation extends FunctionReference<'mutation'>,
  TData = FunctionReturnType<TMutation>,
  TVariables extends FunctionArgs<TMutation> = FunctionArgs<TMutation>,
> extends BaseMutationOptions<TMutation, TData, TVariables> {
  /** Extract entity ID from variables */
  getEntityId: (variables: TVariables) => string;
  /** Query key for the single item being deleted */
  itemQueryKey?: (entityId: string) => QueryKey;
  /** Query key of the list to optimistically update */
  listQueryKey?: QueryKey;
}

/**
 * Delete mutation hook with local-first optimistic removal
 *
 * @example
 * ```tsx
 * const deleteUser = useDLDelete({
 *   mutation: api.users.remove,
 *   table: 'users',
 *   getEntityId: (vars) => vars.id,
 *   listQueryKey: ['users'],
 *   itemQueryKey: (id) => ['users', id],
 * });
 *
 * // Usage
 * deleteUser.mutate({ id: '123' });
 * ```
 */
export const useDLDelete = <
  TMutation extends FunctionReference<'mutation'>,
  TData = FunctionReturnType<TMutation>,
  TVariables extends FunctionArgs<TMutation> = FunctionArgs<TMutation>,
>(
  options: UseDLDeleteOptions<TMutation, TData, TVariables>,
): DLMutationResult<TData | undefined, TVariables> => {
  // Use shared mutation internals
  const internals = useMutationInternals();
  const { queryClient, database, queueManager, isOnline } = internals;

  // Use shared state and refs
  const { isQueued, setIsQueued } = useQueueState();
  const { listContextRef, itemContextRef, entityIdRef, clearRefs } = useOptimisticContextRefs<
    WithId,
    TData
  >();

  const {
    mutation,
    table,
    getEntityId,
    listQueryKey,
    itemQueryKey,
    invalidateKeys = [],
    onSuccess,
    onError,
    onSettled,
  } = options;

  // Get Convex mutation function
  const convexMutation = useConvexMutation(mutation);

  // Mutation function
  const mutationFn = useCallback(
    async (variables: TVariables): Promise<TData | undefined> => {
      // Get entity ID
      const entityId = getEntityId(variables);
      entityIdRef.current = entityId;

      // Resolve provisional ID to server ID if available
      const resolvedId = resolveEntityId(queueManager, entityId);

      // Step 1: Optimistically remove from TanStack cache (list)
      if (listQueryKey) {
        listContextRef.current = optimisticRemoveFromList<WithId>(
          queryClient,
          listQueryKey,
          resolvedId,
        );
      }

      // Step 1b: Optimistically remove single item cache
      if (itemQueryKey) {
        const currentItemKey = itemQueryKey(resolvedId);
        itemContextRef.current = createOptimisticContext<TData>(queryClient, currentItemKey);
        queryClient.removeQueries({ queryKey: currentItemKey });
      }

      // Step 2: Remove from DatabaseFacade cache
      await deleteFromCache(database, table, resolvedId);

      return executeLocalFirstMutation<TData | undefined>({
        isOnline,
        setIsQueued,
        offlineResult: undefined,
        queueOffline: async () => {
          await queueManager.enqueue({
            type: 'delete',
            tableName: table,
            entityId: resolvedId,
            payload: toJsonSerializable(variables),
            invalidateKeys: invalidateKeys.map((key) => JSON.stringify(key)),
          });
        },
        executeOnline: async () => {
          const resolvedVariables = prepareResolvedVariables(variables, entityId, resolvedId);
          return convexMutation(resolvedVariables);
        },
      });
    },
    [
      convexMutation,
      database,
      entityIdRef,
      getEntityId,
      invalidateKeys,
      isOnline,
      itemContextRef,
      itemQueryKey,
      listContextRef,
      listQueryKey,
      queryClient,
      queueManager,
      setIsQueued,
      table,
    ],
  );

  // Create shared callbacks
  const handleSuccess = createOnSuccessCallback({
    internals,
    invalidateKeys,
    listQueryKey,
    entityIdRef,
    onSuccess,
  });

  const handleSettled = createOnSettledCallback({
    clearRefs,
    onSettled,
  });

  // Additional error handling: restore cache entry on delete failure
  const restoreCacheOnError = async (): Promise<void> => {
    const prevData = itemContextRef.current?.previousData;
    if (prevData && entityIdRef.current) {
      const cacheKey = hashQueryKey([table, entityIdRef.current]);
      const entry = createCacheEntry(
        cacheKey,
        [table, entityIdRef.current],
        toJsonSerializable(prevData),
        {
          tableName: table,
          ttl: DEFAULT_CACHE_TTL,
          schemaVersion: SCHEMA_VERSION,
          isOfflineData: true,
        },
      );
      await database.queries.set(entry);
    }
  };

  // Create shared error handler using utility
  const handleError = createOnErrorCallback<TData, TVariables, WithId, TData>({
    internals,
    listContextRef,
    itemContextRef,
    rollbackFn: rollbackOptimisticUpdate,
    errorHandler: handleDeleteError,
    table,
    additionalErrorHandling: restoreCacheOnError,
    onError,
  });

  // TanStack mutation
  const mutationResult = useMutation<TData | undefined, Error, TVariables>({
    mutationFn,

    onSuccess: handleSuccess,

    onError: handleError,

    onSettled: handleSettled,
  });

  return buildMutationResult({
    mutationResult,
    isQueued,
    provisionalId: null, // Deletes don't create provisional IDs
    isOffline: !isOnline,
  });
};
