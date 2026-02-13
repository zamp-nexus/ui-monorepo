/**
 * Unauthorized Handler Response Interceptor
 *
 * Calls an optional callback when a 401/403 response is detected,
 * enabling the application to trigger token refresh or redirect to login.
 *
 * @module interceptors/response/unauthorized-handler
 */

import type { AxiosInstance, AxiosResponse } from 'axios';
import type { AuthConfig } from '../../core/types';
import { HTTP_STATUS } from '../../core/constants';
import { isHttpUnauthorizedError, isHttpForbiddenError } from '../../errors/type-guards';

// =============================================================================
// Types
// =============================================================================

export interface UnauthorizedHandlerOptions {
  readonly auth: AuthConfig;
  readonly debug?: boolean;
}

// =============================================================================
// Interceptor
// =============================================================================

/**
 * Creates the unauthorized handler response interceptor.
 *
 * - `onFulfilled`: detects 401/403 status on fulfilled responses
 *   (with `validateStatus: () => true`, non-2xx arrive as fulfilled).
 * - `onRejected`: detects HttpUnauthorizedError / HttpForbiddenError
 *   that may have been thrown by a prior interceptor.
 *
 * The `onUnauthorized` callback receives `(statusCode, url?)` — no mock
 * AxiosResponse objects are constructed.
 */
export const createUnauthorizedHandlerInterceptor = (
  options: UnauthorizedHandlerOptions,
) => {
  const { auth, debug } = options;

  const onFulfilled = (response: AxiosResponse): AxiosResponse => {
    if (
      auth.enabled &&
      auth.onUnauthorized &&
      (response.status === HTTP_STATUS.UNAUTHORIZED ||
        response.status === HTTP_STATUS.FORBIDDEN)
    ) {
      if (debug) {
        console.log('[HttpClient] Unauthorized response detected:', {
          status: response.status,
          url: response.config?.url,
        });
      }
      auth.onUnauthorized(response.status, response.config?.url);
    }
    return response;
  };

  const onRejected = (error: unknown): never => {
    if (auth.enabled && auth.onUnauthorized) {
      if (isHttpUnauthorizedError(error)) {
        if (debug) {
          console.log('[HttpClient] Unauthorized error detected');
        }
        auth.onUnauthorized(error.statusCode ?? 401, error.url);
      } else if (isHttpForbiddenError(error)) {
        if (debug) {
          console.log('[HttpClient] Forbidden error detected');
        }
        auth.onUnauthorized(error.statusCode ?? 403, error.url);
      }
    }

    throw error;
  };

  return { onFulfilled, onRejected };
};

/**
 * Registers the unauthorized handler interceptor on the given axios instance.
 *
 * @returns Interceptor ID for removal via `instance.interceptors.response.eject`.
 */
export const setupUnauthorizedHandlerInterceptor = (
  instance: AxiosInstance,
  options: UnauthorizedHandlerOptions,
): number => {
  const { onFulfilled, onRejected } = createUnauthorizedHandlerInterceptor(options);
  return instance.interceptors.response.use(onFulfilled, onRejected);
};
