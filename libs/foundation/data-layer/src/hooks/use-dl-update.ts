/**
 * useDLUpdate - Update mutation with optimistic updates
 *
 * Implements local-first optimistic update pattern for modifications.
 * Uses foundation-database for caching and foundation-sync-engine for offline queueing.
 *
 * @module hooks/use-dl-update
 */

import { useCallback } from 'react';
import { useMutation, type QueryKey } from '@tanstack/react-query';
import { useConvexMutation } from '@convex-dev/react-query';
import type { FunctionReference, FunctionArgs, FunctionReturnType } from 'convex/server';
import { toJsonSerializable } from '@open-insights-web/foundation-data-model';
import {
  rollbackOptimisticUpdate,
  optimisticUpdateInList,
  optimisticUpdateItem,
} from '../utils/optimistic-updates';
import {
  persistToCache,
  buildMutationResult,
  executeLocalFirstMutation,
} from '../utils/mutation-helpers';
import {
  useMutationInternals,
  useQueueState,
  useOptimisticContextRefs,
  createOnSuccessCallback,
  createOnSettledCallback,
  createOnErrorCallback,
  resolveEntityId,
  prepareResolvedVariables,
} from '../utils/use-mutation-internals';
import { createScopedErrorHandler } from '../utils/error-handler';
import type { WithId } from '@open-insights-web/foundation-data-model';
import type { BaseMutationOptions, DLMutationResult } from '../core/types';

// Scoped error handler for this hook
const handleUpdateError = createScopedErrorHandler('useDLUpdate');

// =============================================================================
// Types
// =============================================================================

/**
 * Options for useDLUpdate hook
 */
export interface UseDLUpdateOptions<
  TMutation extends FunctionReference<'mutation'>,
  TData = FunctionReturnType<TMutation>,
  TVariables extends FunctionArgs<TMutation> = FunctionArgs<TMutation>,
> extends BaseMutationOptions<TMutation, TData, TVariables> {
  /** Generate optimistic data from variables and previous data */
  onOptimistic: (variables: TVariables, previousData?: TData) => TData;
  /** Extract entity ID from variables */
  getEntityId: (variables: TVariables) => string;
  /** Query key for the single item being updated */
  itemQueryKey?: (entityId: string) => QueryKey;
  /** Query key of the list to optimistically update */
  listQueryKey?: QueryKey;
}

/**
 * Update mutation hook with local-first optimistic updates
 *
 * @example
 * ```tsx
 * const updateUser = useDLUpdate({
 *   mutation: api.users.update,
 *   table: 'users',
 *   getEntityId: (vars) => vars.id,
 *   onOptimistic: (vars, prev) => ({
 *     ...prev,
 *     ...vars,
 *     updatedAt: new Date().toISOString(),
 *   }),
 *   listQueryKey: ['users'],
 *   itemQueryKey: (id) => ['users', id],
 * });
 *
 * // Usage
 * updateUser.mutate({ id: '123', name: 'Jane' });
 * ```
 */
export const useDLUpdate = <
  TMutation extends FunctionReference<'mutation'>,
  TData = FunctionReturnType<TMutation>,
  TVariables extends FunctionArgs<TMutation> = FunctionArgs<TMutation>,
>(
  options: UseDLUpdateOptions<TMutation, TData, TVariables>
): DLMutationResult<TData, TVariables> => {
  // Use shared mutation internals
  const internals = useMutationInternals();
  const { queryClient, database, queueManager, isOnline } = internals;

  // Use shared state and refs
  const { isQueued, setIsQueued } = useQueueState();
  const { listContextRef, itemContextRef, entityIdRef, clearRefs } =
    useOptimisticContextRefs<WithId, TData>();

  const {
    mutation,
    table,
    getEntityId,
    onOptimistic,
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
    async (variables: TVariables): Promise<TData> => {
      // Get entity ID
      const entityId = getEntityId(variables);
      entityIdRef.current = entityId;

      // Resolve provisional ID to server ID if available
      const resolvedId = resolveEntityId(queueManager, entityId);

      // Get current item data for optimistic update
      const currentItemKey = itemQueryKey?.(resolvedId);
      const currentData = currentItemKey
        ? queryClient.getQueryData<TData>(currentItemKey)
        : undefined;

      // Create optimistic data
      const optimisticData = onOptimistic(variables, currentData);

      // Step 1: Optimistically update TanStack cache (list)
      if (listQueryKey) {
        listContextRef.current = optimisticUpdateInList<WithId>(
          queryClient,
          listQueryKey,
          resolvedId,
          (item) => ({ ...item, ...optimisticData })
        );
      }

      // Step 1b: Optimistically update single item cache
      if (currentItemKey) {
        itemContextRef.current = optimisticUpdateItem<TData>(
          queryClient,
          currentItemKey,
          () => optimisticData
        );
      }

      // Step 2: Persist optimistic data to DatabaseFacade
      await persistToCache(database, table, resolvedId, optimisticData, true);

      return executeLocalFirstMutation<TData>({
        isOnline,
        setIsQueued,
        offlineResult: optimisticData,
        queueOffline: async () => {
          await queueManager.enqueue({
            type: 'update',
            tableName: table,
            entityId: resolvedId,
            payload: toJsonSerializable(variables),
            optimisticData: toJsonSerializable(optimisticData),
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
    itemQueryKey,
    entityIdRef,
    onSuccess,
  });

  const handleSettled = createOnSettledCallback({
    clearRefs,
    onSettled,
  });

  // Create shared error handler using utility
  const handleError = createOnErrorCallback<TData, TVariables, WithId, TData>({
    internals,
    listContextRef,
    itemContextRef,
    rollbackFn: rollbackOptimisticUpdate,
    errorHandler: handleUpdateError,
    table,
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
    provisionalId: null, // Updates don't create provisional IDs
    isOffline: !isOnline,
  });
};
