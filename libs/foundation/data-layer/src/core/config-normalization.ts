/**
 * Utilities for normalizing config objects by removing explicit `undefined` values.
 *
 * @module core/config-normalization
 */

import type { DataLayerConfig } from './types';

type UnknownRecord = Record<string, unknown>;

/**
 * Build a shallow copy that excludes keys with `undefined` values.
 */
export const pickDefined = <T extends UnknownRecord>(input: T): Partial<T> => {
  const output: Partial<T> = {};

  for (const [rawKey, rawValue] of Object.entries(input)) {
    if (rawValue === undefined) {
      continue;
    }

    const key = rawKey as keyof T;
    output[key] = rawValue as T[keyof T];
  }

  return output;
};

/**
 * Create a stable, hashable fingerprint for datasource API references.
 */
export const getDatasourceApiFingerprint = (
  datasourceApi: DataLayerConfig['datasourceApi'],
): Record<string, unknown> | null => {
  if (!datasourceApi || typeof datasourceApi !== 'object') {
    return null;
  }

  const value = datasourceApi as Record<string, unknown>;
  return {
    type: value['_type'] ?? null,
    visibility: value['_visibility'] ?? null,
    name: value['_name'] ?? null,
    path: value['_path'] ?? null,
  };
};

/**
 * Normalize provider config before constructing the container.
 */
export const createContainerConfig = (config: DataLayerConfig): DataLayerConfig => ({
  convexUrl: config.convexUrl,
  ...pickDefined({
    tables: config.tables,
    datasourceApi: config.datasourceApi,
    conflictStrategy: config.conflictStrategy,
    enableCrossTab: config.enableCrossTab,
    enableAnalytics: config.enableAnalytics,
    defaultStaleTime: config.defaultStaleTime,
    defaultGcTime: config.defaultGcTime,
    cache: config.cache,
    axiosInstance: config.axiosInstance,
    debug: config.debug,
    onSyncError: config.onSyncError,
  }),
});
