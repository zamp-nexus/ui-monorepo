/**
 * Typed adapters for bridging query-engine hooks with data-layer registry APIs.
 *
 * @module hooks/internal/data-layer-adapters
 */

import type { FunctionReference } from 'convex/server';
import {
  isMutationOperation,
  type Operation,
  type WriteOperation,
  WRITE_OPERATIONS,
} from '../../types/operations';

type QueryFunctionReference = FunctionReference<'query'>;
type MutationFunctionReference = FunctionReference<'mutation'>;

interface ConvexFunctionMap {
  readonly list?: QueryFunctionReference;
  readonly get?: QueryFunctionReference;
  readonly create?: MutationFunctionReference;
  readonly update?: MutationFunctionReference;
  readonly delete?: MutationFunctionReference;
}

interface TableRegistryLike {
  getTable: (
    tableName: string
  ) => { readonly convex?: ConvexFunctionMap } | undefined;
  getTableNames?: () => ReadonlyArray<string>;
}

/**
 * Resolve list query reference for a table.
 */
export const getListQueryReference = (
  tableRegistry: TableRegistryLike,
  tableName: string
): QueryFunctionReference | undefined =>
  tableRegistry.getTable(tableName)?.convex?.list;

/**
 * Return the first available query reference in the registry.
 */
export const getAnyQueryReference = (
  tableRegistry: TableRegistryLike
): QueryFunctionReference | undefined => {
  const tableNames = tableRegistry.getTableNames?.() ?? [];

  for (const tableName of tableNames) {
    const convexFunctions = tableRegistry.getTable(tableName)?.convex;
    if (!convexFunctions) {
      continue;
    }

    if (convexFunctions.list) {
      return convexFunctions.list;
    }

    if (convexFunctions.get) {
      return convexFunctions.get;
    }
  }

  return undefined;
};

/**
 * Resolve mutation reference for the given operation.
 */
export const getMutationReference = (
  tableRegistry: TableRegistryLike,
  tableName: string,
  operation: WriteOperation
): MutationFunctionReference | undefined => {
  const convexFunctions = tableRegistry.getTable(tableName)?.convex;
  if (!convexFunctions) {
    return undefined;
  }

  switch (operation) {
    case WRITE_OPERATIONS.CREATE:
      return convexFunctions.create;
    case WRITE_OPERATIONS.UPDATE:
      return convexFunctions.update;
    case WRITE_OPERATIONS.DELETE:
      return convexFunctions.delete;
    default:
      return undefined;
  }
};

/**
 * Return the first available mutation reference for a table.
 */
export const getAnyMutationReference = (
  tableRegistry: TableRegistryLike,
  tableName: string
): MutationFunctionReference | undefined => {
  const convexFunctions = tableRegistry.getTable(tableName)?.convex;
  if (!convexFunctions) {
    return undefined;
  }

  return convexFunctions.create ?? convexFunctions.update ?? convexFunctions.delete;
};

/**
 * Return the first available mutation reference in the registry.
 */
export const getAnyMutationReferenceFromRegistry = (
  tableRegistry: TableRegistryLike
): MutationFunctionReference | undefined => {
  const tableNames = tableRegistry.getTableNames?.() ?? [];

  for (const tableName of tableNames) {
    const reference = getAnyMutationReference(tableRegistry, tableName);
    if (reference) {
      return reference;
    }
  }

  return undefined;
};

/**
 * Normalize operation to a concrete mutation operation.
 */
export const resolveMutationOperation = (
  operation: Operation | undefined
): WriteOperation =>
  operation !== undefined && isMutationOperation(operation)
    ? operation
    : WRITE_OPERATIONS.CREATE;
