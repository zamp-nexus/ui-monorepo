/**
 * Convex function helpers and types
 * @module convex/functions
 */

import type { FunctionReference } from 'convex/server';
import { getErrorMessage } from '@open-insights-web/foundation-utils';

/**
 * Standard CRUD operation constants
 */
export const CRUD_OPERATION = {
  LIST: 'list',
  GET: 'get',
  CREATE: 'create',
  UPDATE: 'update',
  DELETE: 'delete',
} as const;

/**
 * Standard CRUD operation type
 */
export type CrudOperation = (typeof CRUD_OPERATION)[keyof typeof CRUD_OPERATION];

/**
 * Convex function path builder
 */
export const buildFunctionPath = (module: string, fn: string): string =>
  `${module}:${fn}`;

/**
 * Standard query function names by operation
 */
export const QUERY_FN_NAMES: Record<Extract<CrudOperation, 'list' | 'get'>, string> = {
  [CRUD_OPERATION.LIST]: 'list',
  [CRUD_OPERATION.GET]: 'get',
};

/**
 * Standard mutation function names by operation
 */
export const MUTATION_FN_NAMES: Record<Extract<CrudOperation, 'create' | 'update' | 'delete'>, string> = {
  [CRUD_OPERATION.CREATE]: 'create',
  [CRUD_OPERATION.UPDATE]: 'update',
  [CRUD_OPERATION.DELETE]: 'remove', // 'delete' is reserved in JS
};

/**
 * Table to module mapping type
 */
export type TableModuleMap = Record<string, string>;

/**
 * Default table to module mapping
 * Maps table names to Convex module names
 */
export const DEFAULT_TABLE_MODULE_MAP: TableModuleMap = {
  users: 'users',
  events: 'events',
  sessions: 'sessions',
  tenants: 'tenants',
  projects: 'projects',
  dashboards: 'dashboards',
  reports: 'reports',
};

/**
 * Build query function path for a table
 */
export const buildQueryPath = (
  tableName: string,
  operation: Extract<CrudOperation, 'list' | 'get'>,
  moduleMap: TableModuleMap = DEFAULT_TABLE_MODULE_MAP
): string => {
  const module = moduleMap[tableName] ?? tableName;
  const fn = QUERY_FN_NAMES[operation];
  return buildFunctionPath(module, fn);
};

/**
 * Build mutation function path for a table
 */
export const buildMutationPath = (
  tableName: string,
  operation: Extract<CrudOperation, 'create' | 'update' | 'delete'>,
  moduleMap: TableModuleMap = DEFAULT_TABLE_MODULE_MAP
): string => {
  const module = moduleMap[tableName] ?? tableName;
  const fn = MUTATION_FN_NAMES[operation];
  return buildFunctionPath(module, fn);
};

/**
 * Convex function registry for type-safe access
 */
export interface ConvexFunctionRegistry {
  queries: Record<string, FunctionReference<'query'>>;
  mutations: Record<string, FunctionReference<'mutation'>>;
}

/**
 * Create a type-safe function registry
 */
export const createFunctionRegistry = (
  queries: Record<string, FunctionReference<'query'>>,
  mutations: Record<string, FunctionReference<'mutation'>>
): ConvexFunctionRegistry => ({ queries, mutations });

/**
 * Convex error types
 */
export const CONVEX_ERROR_TYPES = {
  NOT_FOUND: 'NOT_FOUND',
  UNAUTHORIZED: 'UNAUTHORIZED',
  VALIDATION: 'VALIDATION_ERROR',
  CONFLICT: 'CONFLICT',
  RATE_LIMITED: 'RATE_LIMITED',
  INTERNAL: 'INTERNAL_ERROR',
} as const;

export type ConvexErrorType = typeof CONVEX_ERROR_TYPES[keyof typeof CONVEX_ERROR_TYPES];

/**
 * Parse Convex error to get error type
 */
export const parseConvexError = (error: unknown): {
  type: ConvexErrorType;
  message: string;
  isRetryable: boolean;
} => {
  const message = getErrorMessage(error);

  // Check for known error patterns
  if (message.includes('not found') || message.includes('does not exist')) {
    return { type: CONVEX_ERROR_TYPES.NOT_FOUND, message, isRetryable: false };
  }

  if (message.includes('unauthorized') || message.includes('permission denied')) {
    return { type: CONVEX_ERROR_TYPES.UNAUTHORIZED, message, isRetryable: false };
  }

  if (message.includes('validation') || message.includes('invalid')) {
    return { type: CONVEX_ERROR_TYPES.VALIDATION, message, isRetryable: false };
  }

  if (message.includes('conflict') || message.includes('already exists')) {
    return { type: CONVEX_ERROR_TYPES.CONFLICT, message, isRetryable: false };
  }

  if (message.includes('rate limit') || message.includes('too many requests')) {
    return { type: CONVEX_ERROR_TYPES.RATE_LIMITED, message, isRetryable: true };
  }

  // Default to internal error (retryable)
  return { type: CONVEX_ERROR_TYPES.INTERNAL, message, isRetryable: true };
};
