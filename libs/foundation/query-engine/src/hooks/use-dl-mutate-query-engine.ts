/**
 * useDLMutateQueryEngine - Unified Mutation Hook
 *
 * Main mutation hook that routes to appropriate Data Layer mutation hooks
 * based on the operation type (create, update, delete).
 *
 * Features:
 * - Automatic operation detection from query
 * - Optimistic updates with provisional IDs
 * - Offline mutation queueing via data-layer
 * - Query invalidation
 *
 * NOTE: This hook delegates ALL execution to foundation-data-layer.
 * It does NOT directly access Convex.
 *
 * @module hooks/use-dl-mutate-query-engine
 */

import { useMemo, useCallback } from 'react';
import type { QueryKey } from '@tanstack/react-query';
import {
  useDataLayerInternals,
  useDLCreate,
  useDLUpdate,
  useDLDelete,
} from '@open-insights-web/foundation-data-layer';
import type { FunctionReference } from 'convex/server';

import { getTableExtractor } from '../engine/table-extractor';
import { EMPTY_ARRAY } from '@open-insights-web/foundation-utils';
import {
  type UseDLMutateQueryEngineOptions,
  type UseDLMutateQueryEngineResult,
  type MutationOperation,
  MUTATION_OPERATIONS,
} from './types';

// =============================================================================
// HELPERS
// =============================================================================

/**
 * Default entity ID extractor
 */
const defaultGetEntityId = <TVariables>(variables: TVariables): string => {
  const v = variables as Record<string, unknown>;
  return String(v.id ?? v._id ?? '');
};

const toRecord = (value: unknown): Record<string, unknown> => {
  if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }

  return {};
};

// =============================================================================
// HOOK IMPLEMENTATION
// =============================================================================

/**
 * useDLMutateQueryEngine
 *
 * Unified mutation hook that routes to Data Layer mutation hooks
 * based on the operation type.
 *
 * @typeParam TData - Result data type
 * @typeParam TVariables - Mutation variables type
 *
 * @example
 * ```tsx
 * // Create mutation
 * const { mutate } = useDLMutateQueryEngine({
 *   query: { operation: 'create', dimensions: [{ member: 'users.name' }] },
 *   onOptimistic: (vars) => ({
 *     ...vars,
 *     id: 'provisional-123',
 *     createdAt: new Date().toISOString(),
 *   }),
 * });
 *
 * mutate({ name: 'John', email: 'john@example.com' });
 *
 * // Update mutation
 * const { mutate: update } = useDLMutateQueryEngine({
 *   query: { operation: 'update', entityId: '123', dimensions: [{ member: 'users.name' }] },
 *   onOptimistic: (vars, prev) => ({ ...prev, ...vars }),
 *   getEntityId: (vars) => vars.id,
 * });
 *
 * update({ id: '123', name: 'Jane' });
 * ```
 */
export const useDLMutateQueryEngine = <TData = unknown, TVariables = unknown>(
  options: UseDLMutateQueryEngineOptions<TData, TVariables>
): UseDLMutateQueryEngineResult<TData, TVariables> => {
  const {
    query,
    onOptimistic,
    getEntityId = defaultGetEntityId,
    invalidateKeys,
    onSuccess,
    onError,
    onSettled,
  } = options;

  // ─────────────────────────────────────────────────────────────────────────
  // DATA LAYER CONTEXT
  // ─────────────────────────────────────────────────────────────────────────

  const { isOnline, tableRegistry, queryClient } = useDataLayerInternals();

  // ─────────────────────────────────────────────────────────────────────────
  // ENGINE COMPONENTS (Singletons)
  // ─────────────────────────────────────────────────────────────────────────

  const tableExtractor = getTableExtractor();

  // ─────────────────────────────────────────────────────────────────────────
  // EXTRACT TABLE AND OPERATION
  // ─────────────────────────────────────────────────────────────────────────

  const extraction = useMemo(
    () => tableExtractor.extractDetailed(query),
    [tableExtractor, query]
  );

  const table = extraction.primaryTable ?? '';
  const operation: MutationOperation = (query.operation ?? MUTATION_OPERATIONS.CREATE) as MutationOperation;

  // ─────────────────────────────────────────────────────────────────────────
  // GET CONVEX MUTATION REFS
  // ─────────────────────────────────────────────────────────────────────────

  const mutationRefs = useMemo(() => {
    if (!table) return null;
    return {
      create: tableRegistry.getConvexRef(table, 'create'),
      update: tableRegistry.getConvexRef(table, 'update'),
      delete: tableRegistry.getConvexRef(table, 'delete'),
    };
  }, [tableRegistry, table]);

  // List query key for optimistic updates
  const listQueryKey = useMemo(() => {
    if (!table) return undefined;
    return ['convex', table, 'list'] as const;
  }, [table]);

  // ─────────────────────────────────────────────────────────────────────────
  // SHARED CALLBACKS
  // ─────────────────────────────────────────────────────────────────────────

  const handleSuccess = useCallback(
    async (data: unknown, vars: unknown) => {
      // Invalidate additional keys
      if (invalidateKeys && invalidateKeys.length > 0) {
        await Promise.all(
          invalidateKeys.map((key) =>
            queryClient.invalidateQueries({ queryKey: key as QueryKey })
          )
        );
      }
      await onSuccess?.(data as TData, vars as TVariables);
    },
    [invalidateKeys, queryClient, onSuccess]
  );

  const handleError = useCallback(
    async (error: Error, vars: unknown) => {
      await onError?.(error, vars as TVariables);
    },
    [onError]
  );

  const handleSettled = useCallback(
    async (data: unknown, error: Error | null, vars: unknown) => {
      await onSettled?.(data as TData | undefined, error, vars as TVariables);
    },
    [onSettled]
  );

  // ─────────────────────────────────────────────────────────────────────────
  // CREATE MUTATION
  // ─────────────────────────────────────────────────────────────────────────

  const isCreateEnabled = operation === MUTATION_OPERATIONS.CREATE && mutationRefs?.create !== undefined;

  const createOptimistic = useCallback(
    (vars: unknown): unknown => {
      if (!onOptimistic) return vars;
      return onOptimistic(vars as TVariables, undefined);
    },
    [onOptimistic]
  );

  // Convex FunctionReference generics are resolved dynamically from the table
  // registry, so the cast to FunctionReference<'mutation'> is unavoidable here.
  const createMutation = useDLCreate({
    mutation: (mutationRefs?.create ?? undefined) as FunctionReference<'mutation'>,
    table,
    onOptimistic: createOptimistic,
    listQueryKey: isCreateEnabled ? listQueryKey : undefined,
    invalidateKeys: (invalidateKeys ?? EMPTY_ARRAY) as QueryKey[],
    onSuccess: handleSuccess,
    onError: handleError,
    onSettled: handleSettled,
  });

  // ─────────────────────────────────────────────────────────────────────────
  // UPDATE MUTATION
  // ─────────────────────────────────────────────────────────────────────────

  const isUpdateEnabled = operation === MUTATION_OPERATIONS.UPDATE && mutationRefs?.update !== undefined;

  const updateOptimistic = useCallback(
    (vars: unknown, prev: unknown): unknown => {
      if (!onOptimistic) {
        return { ...toRecord(prev), ...toRecord(vars) };
      }
      return onOptimistic(vars as TVariables, prev as TData);
    },
    [onOptimistic]
  );

  const updateMutation = useDLUpdate({
    mutation: (mutationRefs?.update ?? undefined) as FunctionReference<'mutation'>,
    table,
    getEntityId: getEntityId as (vars: unknown) => string,
    onOptimistic: updateOptimistic,
    listQueryKey: isUpdateEnabled ? listQueryKey : undefined,
    invalidateKeys: (invalidateKeys ?? EMPTY_ARRAY) as QueryKey[],
    onSuccess: handleSuccess,
    onError: handleError,
    onSettled: handleSettled,
  });

  // ─────────────────────────────────────────────────────────────────────────
  // DELETE MUTATION
  // ─────────────────────────────────────────────────────────────────────────

  const isDeleteEnabled = operation === MUTATION_OPERATIONS.DELETE && mutationRefs?.delete !== undefined;

  const deleteMutation = useDLDelete({
    mutation: (mutationRefs?.delete ?? undefined) as FunctionReference<'mutation'>,
    table,
    getEntityId: getEntityId as (vars: unknown) => string,
    listQueryKey: isDeleteEnabled ? listQueryKey : undefined,
    invalidateKeys: (invalidateKeys ?? EMPTY_ARRAY) as QueryKey[],
    onSuccess: handleSuccess,
    onError: handleError,
    onSettled: handleSettled,
  });

  // ─────────────────────────────────────────────────────────────────────────
  // SELECT ACTIVE MUTATION
  // ─────────────────────────────────────────────────────────────────────────

  const activeMutation = useMemo(() => {
    switch (operation) {
      case MUTATION_OPERATIONS.CREATE:
        return {
          mutation: createMutation,
          op: MUTATION_OPERATIONS.CREATE,
        };
      case MUTATION_OPERATIONS.UPDATE:
        return {
          mutation: updateMutation,
          op: MUTATION_OPERATIONS.UPDATE,
        };
      case MUTATION_OPERATIONS.DELETE:
        return {
          mutation: deleteMutation,
          op: MUTATION_OPERATIONS.DELETE,
        };
      default:
        return {
          mutation: createMutation,
          op: MUTATION_OPERATIONS.CREATE,
        };
    }
  }, [operation, createMutation, updateMutation, deleteMutation]);

  // ─────────────────────────────────────────────────────────────────────────
  // BUILD RESULT
  // ─────────────────────────────────────────────────────────────────────────

  const mut = activeMutation.mutation;

  // Create stable mutate function
  const mutate = useCallback(
    (variables: TVariables) => {
      mut.mutate(variables as never);
    },
    [mut]
  );

  // Create stable mutateAsync function
  const mutateAsync = useCallback(
    async (variables: TVariables): Promise<TData> => {
      return (await mut.mutateAsync(variables as never)) as TData;
    },
    [mut]
  );

  // Reset function
  const reset = useCallback(() => {
    mut.reset();
  }, [mut]);

  return {
    // Mutation functions
    mutate,
    mutateAsync,

    // Mutation state
    data: mut.data as TData | undefined,
    isPending: mut.isPending,
    isSuccess: mut.isSuccess,
    isError: mut.isError,
    isIdle: mut.isIdle,
    error: mut.error ?? null,

    // Offline status
    isQueued: mut.isQueued ?? false,
    isOffline: !isOnline,
    provisionalId: mut.provisionalId ?? null,

    // Execution info
    executionPath: 'transactional',
    operation: activeMutation.op,
    table: table || null,

    // Actions
    reset,
  };
};
