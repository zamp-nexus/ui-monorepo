/**
 * Shared table configuration contracts.
 *
 * @module contracts/table-config
 */

import type { ConflictStrategy } from '../types';
import type { DataFreshnessLevel } from './analytics';

/**
 * Convex function references for a table.
 *
 * Generics keep this contract independent from Convex runtime types.
 */
export interface UnifiedTableConvexConfig<TQueryRef = unknown, TMutationRef = unknown> {
  readonly list?: TQueryRef;
  readonly get?: TQueryRef;
  readonly create?: TMutationRef;
  readonly update?: TMutationRef;
  readonly delete?: TMutationRef;
}

/**
 * Conflict merge rules for field-level resolution.
 */
export interface UnifiedTableMergeConfig {
  readonly serverFields?: ReadonlyArray<string>;
  readonly clientFields?: ReadonlyArray<string>;
  readonly deepMergeFields?: ReadonlyArray<string>;
  readonly customMerge?: (serverValue: unknown, clientValue: unknown, field: string) => unknown;
}

/**
 * Analytics configuration for a table.
 */
export interface TableAnalyticsConfig {
  readonly enabled: boolean;
  readonly freshness?: DataFreshnessLevel;
  readonly staleTime?: number;
}

/**
 * Canonical table configuration shared across foundation layers.
 */
export interface UnifiedTableConfig<TQueryRef = unknown, TMutationRef = unknown> {
  readonly name: string;
  readonly convex?: UnifiedTableConvexConfig<TQueryRef, TMutationRef>;
  readonly staleTime?: number;
  readonly gcTime?: number;
  readonly conflictStrategy?: ConflictStrategy;
  readonly mergeConfig?: UnifiedTableMergeConfig;
  readonly analytics?: TableAnalyticsConfig;
}
