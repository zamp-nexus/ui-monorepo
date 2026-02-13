/**
 * Conflict resolution strategies
 * 
 * NOTE: ConflictStrategy, ConflictContext, ConflictResult, and MergeConfig types
 * should be imported directly from @open-insights-web/foundation-data-model
 * 
 * @module conflicts/strategies
 */

import isEqual from 'react-fast-compare';
import {
  ConflictStrategy,
  type ConflictContext,
  type ConflictResult,
  type MergeConfig,
} from '@open-insights-web/foundation-data-model';

/**
 * Default merge configuration
 */
export const DEFAULT_MERGE_CONFIG: MergeConfig = {
  serverWinsFields: ['id', 'createdAt', 'tenantId'],
  clientWinsFields: [],
  concatFields: [],
  unionFields: [],
  customMerge: {},
};

/**
 * Server-wins strategy: Always use server data
 */
export const serverWins = <T>(context: ConflictContext<T>): ConflictResult<T> => ({
  resolvedData: context.serverData,
  winner: 'server',
  requiresReview: false,
});

/**
 * Client-wins strategy: Always use client data
 */
export const clientWins = <T>(context: ConflictContext<T>): ConflictResult<T> => ({
  resolvedData: context.clientData,
  winner: 'client',
  requiresReview: false,
});

/**
 * Last-write-wins strategy: Use data with latest timestamp
 */
export const lastWriteWins = <T>(context: ConflictContext<T>): ConflictResult<T> => {
  if (context.clientTimestamp > context.serverTimestamp) {
    return {
      resolvedData: context.clientData,
      winner: 'client',
      requiresReview: false,
    };
  }

  return {
    resolvedData: context.serverData,
    winner: 'server',
    requiresReview: false,
  };
};

/**
 * Merge strategy: Field-level merge with configurable rules
 */
export const merge = <T extends Record<string, unknown>>(
  context: ConflictContext<T>,
  config: MergeConfig = DEFAULT_MERGE_CONFIG
): ConflictResult<T> => {
  const serverData = context.serverData;
  const clientData = context.clientData;
  const baseData = context.baseData ?? ({} as T);

  const resolvedData: Record<string, unknown> = {};
  const mergedFields: string[] = [];
  const conflictedFields: string[] = [];

  // Get all unique keys
  const allKeys = new Set([
    ...Object.keys(serverData),
    ...Object.keys(clientData),
  ]);

  for (const key of allKeys) {
    const serverValue = serverData[key];
    const clientValue = clientData[key];
    const baseValue = baseData[key];

    // Server-wins fields
    if (config.serverWinsFields?.includes(key)) {
      resolvedData[key] = serverValue;
      continue;
    }

    // Client-wins fields
    if (config.clientWinsFields?.includes(key)) {
      resolvedData[key] = clientValue;
      if (!isEqual(serverValue, clientValue)) {
        mergedFields.push(key);
      }
      continue;
    }

    // Custom merge function
    if (config.customMerge?.[key]) {
      resolvedData[key] = config.customMerge[key](serverValue, clientValue, baseValue);
      mergedFields.push(key);
      continue;
    }

    // Concat fields (arrays)
    if (config.concatFields?.includes(key) && Array.isArray(serverValue) && Array.isArray(clientValue)) {
      resolvedData[key] = [...serverValue, ...clientValue];
      mergedFields.push(key);
      continue;
    }

    // Union fields (arrays/sets)
    if (config.unionFields?.includes(key) && Array.isArray(serverValue) && Array.isArray(clientValue)) {
      // Use deep equality for deduplication
      const combined = [...serverValue];
      for (const item of clientValue) {
        if (!combined.some(existing => isEqual(existing, item))) {
          combined.push(item);
        }
      }
      resolvedData[key] = combined;
      mergedFields.push(key);
      continue;
    }

    // Auto-merge logic using deep equality
    // If values are equal, use either
    if (isEqual(serverValue, clientValue)) {
      resolvedData[key] = serverValue;
      continue;
    }

    // If client hasn't changed from base, use server
    if (isEqual(clientValue, baseValue)) {
      resolvedData[key] = serverValue;
      continue;
    }

    // If server hasn't changed from base, use client
    if (isEqual(serverValue, baseValue)) {
      resolvedData[key] = clientValue;
      mergedFields.push(key);
      continue;
    }

    // Both changed - conflict
    // Default to server but flag for review
    resolvedData[key] = serverValue;
    conflictedFields.push(key);
  }

  return {
    resolvedData: resolvedData as T,
    winner: conflictedFields.length > 0 ? 'merged' : mergedFields.length > 0 ? 'merged' : 'server',
    requiresReview: conflictedFields.length > 0,
    mergedFields,
    conflictedFields,
  };
};

/**
 * Manual strategy: Return server data but flag for manual review
 *
 * This strategy is used when conflicts should be presented to the user
 * for manual resolution via UI. It returns server data as a placeholder
 * but marks requiresReview as true.
 */
export const manual = <T>(context: ConflictContext<T>): ConflictResult<T> => ({
  resolvedData: context.serverData,
  winner: 'server',
  requiresReview: true,
});

/**
 * Strategy resolver map
 */
export const strategyResolvers: Record<
  ConflictStrategy,
  <T>(context: ConflictContext<T>, config?: MergeConfig) => ConflictResult<T>
> = {
  [ConflictStrategy.SERVER_WINS]: serverWins,
  [ConflictStrategy.CLIENT_WINS]: clientWins,
  [ConflictStrategy.LAST_WRITE_WINS]: lastWriteWins,
  [ConflictStrategy.MERGE]: merge as <T>(context: ConflictContext<T>, config?: MergeConfig) => ConflictResult<T>,
  [ConflictStrategy.MANUAL]: manual,
};
