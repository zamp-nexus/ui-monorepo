/**
 * Params Request Interceptor
 *
 * Handles query parameter cleaning and serialization.
 *
 * @module interceptors/request/params-interceptor
 */

import type { AxiosInstance, InternalAxiosRequestConfig } from 'axios';

import type { ParamsArrayFormat } from '../../core/constants';

// =============================================================================
// Types
// =============================================================================

export interface ParamsInterceptorOptions {
  readonly removeNullish?: boolean;
  readonly arrayFormat?: ParamsArrayFormat;
  readonly debug?: boolean;
}

// =============================================================================
// Utilities
// =============================================================================

/**
 * Strips null/undefined values from a params object.
 * Returns undefined when the result is empty.
 */
const cleanParams = (
  params: Record<string, unknown> | undefined,
): Record<string, unknown> | undefined => {
  if (!params) return params;

  const cleaned: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(params)) {
    if (value !== null && value !== undefined) {
      cleaned[key] = value;
    }
  }

  return Object.keys(cleaned).length > 0 ? cleaned : undefined;
};

/**
 * Serializes an array value into a query-string fragment based on format.
 */
const serializeArrayParam = (
  key: string,
  values: unknown[],
  format: ParamsArrayFormat | undefined,
): string => {
  const encodedKey = encodeURIComponent(key);

  switch (format) {
    case 'brackets':
      return values.map((v) => `${encodedKey}[]=${encodeURIComponent(String(v))}`).join('&');
    case 'indices':
      return values.map((v, i) => `${encodedKey}[${i}]=${encodeURIComponent(String(v))}`).join('&');
    case 'comma':
      return `${encodedKey}=${values.map((v) => encodeURIComponent(String(v))).join(',')}`;
    case 'repeat':
    default:
      return values.map((v) => `${encodedKey}=${encodeURIComponent(String(v))}`).join('&');
  }
};

/**
 * Creates a params serializer function for axios.
 */
export const createParamsSerializer = (
  options: ParamsInterceptorOptions,
): ((params: Record<string, unknown>) => string) => {
  return (params: Record<string, unknown>): string => {
    const parts: string[] = [];

    for (const [key, value] of Object.entries(params)) {
      if (value === null || value === undefined) {
        if (!options.removeNullish) {
          parts.push(`${encodeURIComponent(key)}=`);
        }
        continue;
      }

      if (Array.isArray(value)) {
        if (value.length > 0) {
          parts.push(serializeArrayParam(key, value, options.arrayFormat));
        }
        continue;
      }

      if (typeof value === 'object') {
        parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(JSON.stringify(value))}`);
        continue;
      }

      parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`);
    }

    return parts.join('&');
  };
};

// =============================================================================
// Interceptor
// =============================================================================

/**
 * Creates the params request interceptor function.
 *
 * Removes null/undefined values from query parameters when configured.
 */
export const createParamsInterceptor = (options: ParamsInterceptorOptions = {}) => {
  const { removeNullish = true, debug } = options;

  return (config: InternalAxiosRequestConfig): InternalAxiosRequestConfig => {
    if (removeNullish && config.params) {
      const originalParams = config.params as Record<string, unknown>;
      config.params = cleanParams(originalParams);

      if (debug) {
        console.log('[HttpClient] Params cleaned:', {
          original: originalParams,
          cleaned: config.params,
        });
      }
    }

    return config;
  };
};

/**
 * Registers the params interceptor on the given axios instance.
 *
 * @returns Interceptor ID for removal via `instance.interceptors.request.eject`.
 */
export const setupParamsInterceptor = (
  instance: AxiosInstance,
  options: ParamsInterceptorOptions = {},
): number => instance.interceptors.request.use(createParamsInterceptor(options), undefined);
