/**
 * Utility exports
 *
 * NOTE: For DataSource type, import directly from @open-insights-web/foundation-data-model
 * NOTE: For generic error utilities (normalizeError, formatErrorMessage,
 * isErrorType, isAbortError, isNetworkError), import from @open-insights-web/foundation-utils
 * NOTE: For DEFAULT_CACHE_TTL, import from core/constants or core module
 *
 * @module utils
 */

// =============================================================================
// Query Key Utilities
// =============================================================================

export { buildQueryKey, getDataSource } from './query-key';

// =============================================================================
// Optimistic Update Utilities
// =============================================================================

export {
  // Types
  type OptimisticContext,

  // Core optimistic functions
  createOptimisticContext,
  rollbackOptimisticUpdate,

  // List operations
  optimisticAddToList,
  optimisticRemoveFromList,
  optimisticUpdateInList,

  // Single item operations
  optimisticUpdateItem,
  replaceProvisionalId,
} from './optimistic-updates';

// =============================================================================
// Mutation Helper Utilities
// =============================================================================

export {
  // Query invalidation
  invalidateQueries,
  collectInvalidationKeys,

  // Cache operations
  createCacheEntryWithDefaults,
  persistToCache,
  deleteFromCache,
  type CreateCacheEntryOptions,

  // Result building
  buildMutationResult,
  type BuildMutationResultOptions,
} from './mutation-helpers';

// =============================================================================
// Error Handling Utilities
// =============================================================================

export {
  // Const patterns (use these instead of raw strings)
  ErrorSeverity,
  HookContext,

  // Core error handling
  handleError,
  createScopedErrorHandler,

  // Async error utilities
  safeAsync,
  tryCatchAsync,

  // Types
  type ErrorHandlerOptions,
} from './error-handler';
