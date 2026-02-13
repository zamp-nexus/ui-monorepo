/**
 * Base type definitions derived from Zod schemas
 * @module types/base
 */

import type { z } from 'zod';
import type {
  BaseEntitySchema,
  TimestampsSchema,
  SoftDeleteSchema,
  TenantScopedSchema,
  PaginationParamsSchema,
  SortDirectionSchema,
  DateRangeSchema,
} from '../schemas/base.schema';

/**
 * Timestamps type
 */
export type Timestamps = z.infer<typeof TimestampsSchema>;

/**
 * Base entity type with ID and timestamps
 */
export type BaseEntity = z.infer<typeof BaseEntitySchema>;

/**
 * Soft delete fields type
 */
export type SoftDelete = z.infer<typeof SoftDeleteSchema>;

/**
 * Tenant-scoped entity type
 */
export type TenantScoped = z.infer<typeof TenantScopedSchema>;

/**
 * Pagination parameters type
 */
export type PaginationParams = z.infer<typeof PaginationParamsSchema>;

/**
 * Sort direction type
 */
export type SortDirection = z.infer<typeof SortDirectionSchema>;

/**
 * Date range filter type
 */
export type DateRange = z.infer<typeof DateRangeSchema>;

/**
 * Paginated response wrapper
 */
export interface PaginatedResponse<T> {
  data: T[];
  nextCursor: string | null;
  hasMore: boolean;
  total?: number;
}

/**
 * API response wrapper
 */
export interface ApiResponse<T> {
  data: T;
  meta?: Record<string, unknown>;
}

/**
 * API error response
 */
export interface ApiError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

/**
 * Mutation result type
 */
export interface MutationResult<T> {
  success: boolean;
  data?: T;
  error?: ApiError;
}

/**
 * Data source identifier for query results
 *
 * A simplified data source type for tracking where query data came from.
 * Use this for query state tracking.
 *
 * - 'convex': Data from Convex real-time subscription
 * - 'cache': Data from local cache
 * - 'none': No data available
 */
export type DataSource = 'convex' | 'cache' | 'none';

/**
 * Data source identifier for offline metadata
 *
 * Composes {@link DataSource} with additional offline-specific sources.
 *
 * - 'convex': Data from Convex real-time subscription (via DataSource)
 * - 'cache': Data from local cache / TanStack Query cache (via DataSource)
 * - 'none': No data source / initial state (via DataSource)
 * - 'network': Data from network request
 * - 'offline_db': Data from offline IndexedDB storage
 */
export type OfflineDataSource = DataSource | 'network' | 'offline_db';

/**
 * Offline metadata attached to queries/mutations
 */
export interface OfflineMetadata {
  isOffline: boolean;
  isStale: boolean;
  lastSyncedAt: string | null;
  source: OfflineDataSource;
}

/**
 * Entity with offline metadata
 */
export type WithOfflineMetadata<T> = T & {
  _offline?: OfflineMetadata;
};

/**
 * ID mapping for offline-created entities
 */
export interface IdMapping {
  provisionalId: string;
  serverId: string;
  tableName: string;
  mappedAt: string;
}

// =============================================================================
// Validation Types (deprecated — re-exported from compat module)
// =============================================================================

/**
 * @deprecated Use `ValidationResult` from `validation.types.ts` instead.
 * Re-exported from `compat.types.ts` for backward compatibility.
 */
export type { SimpleValidationResult } from './compat';
