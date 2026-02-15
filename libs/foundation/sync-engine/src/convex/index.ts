/**
 * Convex exports
 * @module convex
 */

export {
  ConvexSyncAdapter,
  createConvexAdapter,
  type ConvexAdapterConfig,
  type ConvexQueryOptions,
  type ConvexMutationOptions,
} from './adapter';

export {
  buildFunctionPath,
  buildQueryPath,
  buildMutationPath,
  createFunctionRegistry,
  parseConvexError,
  CRUD_OPERATION,
  QUERY_FN_NAMES,
  MUTATION_FN_NAMES,
  DEFAULT_TABLE_MODULE_MAP,
  CONVEX_ERROR_TYPE,
} from './functions';

export type {
  CrudOperation,
  ConvexErrorType,
  TableModuleMap,
  ConvexFunctionRegistry,
} from './functions';
