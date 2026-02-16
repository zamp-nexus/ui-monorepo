/**
 * Auth Request Interceptor
 *
 * Injects authentication token into request headers.
 *
 * @module interceptors/request/auth-interceptor
 */

import type { AxiosInstance, InternalAxiosRequestConfig } from 'axios';

import { HTTP_HEADERS } from '../../core/constants';
import type { AuthConfig } from '../../core/types';

// =============================================================================
// Types
// =============================================================================

export interface AuthInterceptorOptions {
  readonly auth: AuthConfig;
  readonly getAccessToken: () => Promise<string | null>;
  readonly debug?: boolean;
}

// =============================================================================
// Interceptor
// =============================================================================

/**
 * Creates the auth request interceptor function.
 *
 * Injects Bearer token into the Authorization header when auth is enabled
 * and a token is available. Skips silently if the header is already set
 * or if token retrieval fails (the request proceeds unauthenticated).
 */
export const createAuthInterceptor = (options: AuthInterceptorOptions) => {
  const { auth, getAccessToken, debug } = options;

  return async (config: InternalAxiosRequestConfig): Promise<InternalAxiosRequestConfig> => {
    if (!auth.enabled) {
      return config;
    }

    if (config.headers?.[HTTP_HEADERS.AUTHORIZATION]) {
      return config;
    }

    try {
      const token = await getAccessToken();

      if (token) {
        const tokenType = auth.tokenType ?? 'Bearer';
        config.headers = config.headers ?? {};
        config.headers[HTTP_HEADERS.AUTHORIZATION] = `${tokenType} ${token}`;

        if (debug) {
          console.log('[HttpClient] Auth token injected');
        }
      } else if (debug) {
        console.log('[HttpClient] No auth token available');
      }
    } catch (error) {
      if (debug) {
        console.warn('[HttpClient] Failed to get auth token:', error);
      }
    }

    return config;
  };
};

/**
 * Registers the auth interceptor on the given axios instance.
 *
 * @returns Interceptor ID for removal via `instance.interceptors.request.eject`.
 */
export const setupAuthInterceptor = (
  instance: AxiosInstance,
  options: AuthInterceptorOptions,
): number => instance.interceptors.request.use(createAuthInterceptor(options), undefined);
