/**
 * @foundation/database - Internal Exports
 *
 * @internal
 * Internal exports for foundation library use only.
 * Not part of public API - may change without notice.
 *
 * These exports are used internally by the foundation layer but should not
 * be imported directly by application code. Use DatabaseFacade instead.
 *
 * @packageDocumentation
 */

// ============================================================================
// Core Database (Internal)
// ============================================================================

export {
  InsightsDatabase,
  getDatabase,
  resetDatabase,
  hasDatabase,
  type DatabaseStats,
} from './core/database';

// ============================================================================
// Table Types (Internal)
// ============================================================================

export type { SyncStateEntry } from './tables';

// ============================================================================
// Services (Internal)
// ============================================================================

export {
  BaseService,
  QueryCacheService,
  MutationQueueService,
  SyncStateService,
  OpfsMetadataService,
  type ExtendedCreateMutationOptions,
} from './services';
