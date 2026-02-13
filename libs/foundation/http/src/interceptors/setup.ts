/**
 * Interceptor Setup
 *
 * Orchestrates the registration of all interceptors on an axios instance.
 *
 * @module interceptors/setup
 */

import type { AxiosInstance } from 'axios';
import type { ResolvedHttpConfig, ClientHeadersConfig } from '../core/types';

import { setupAuthInterceptor } from './request/auth-interceptor';
import { setupHeadersInterceptor } from './request/headers-interceptor';
import { setupParamsInterceptor } from './request/params-interceptor';

import { setupErrorNormalizerInterceptor } from './response/error-normalizer';
import { setupUnauthorizedHandlerInterceptor } from './response/unauthorized-handler';
import { setupRetryInterceptor } from './response/retry-interceptor';

// =============================================================================
// Types
// =============================================================================

/** Interceptor IDs for later removal via `eject`. */
export interface InterceptorIds {
  readonly request: {
    readonly headers: number;
    readonly params: number;
    readonly auth: number;
  };
  readonly response: {
    readonly errorNormalizer: number;
    readonly unauthorizedHandler: number;
    readonly retry: number;
  };
}

export interface SetupInterceptorsOptions {
  readonly getAccessToken: () => Promise<string | null>;
  readonly clientHeaders?: ClientHeadersConfig;
}

// =============================================================================
// Setup
// =============================================================================

/**
 * Registers all interceptors on the given axios instance.
 *
 * **Execution order matters.**
 *
 * Request interceptors (LIFO — last registered runs first):
 *  1. Auth      (runs last in registration → runs first at request time)
 *  2. Params
 *  3. Headers
 *
 * Response interceptors (FIFO — first registered runs first):
 *  1. Retry               → retries before errors are normalised
 *  2. Unauthorized handler → triggers auth callback before normalisation
 *  3. Error normalizer     → converts raw responses/AxiosErrors to HttpErrors
 */
export const setupInterceptors = (
  instance: AxiosInstance,
  config: ResolvedHttpConfig,
  options: SetupInterceptorsOptions,
): InterceptorIds => {
  const { getAccessToken, clientHeaders } = options;
  const { auth, retry, debug } = config;

  // -- Request interceptors (LIFO) -------------------------------------------

  const headersId = setupHeadersInterceptor(instance, {
    clientHeaders,
    debug,
  });

  const paramsId = setupParamsInterceptor(instance, {
    removeNullish: true,
    debug,
  });

  const authId = setupAuthInterceptor(instance, {
    auth,
    getAccessToken,
    debug,
  });

  // -- Response interceptors (FIFO) ------------------------------------------

  const retryId = setupRetryInterceptor(instance, {
    retry,
    debug,
  });

  const unauthorizedHandlerId = setupUnauthorizedHandlerInterceptor(instance, {
    auth,
    debug,
  });

  const errorNormalizerId = setupErrorNormalizerInterceptor(instance, {
    debug,
  });

  return {
    request: {
      headers: headersId,
      params: paramsId,
      auth: authId,
    },
    response: {
      errorNormalizer: errorNormalizerId,
      unauthorizedHandler: unauthorizedHandlerId,
      retry: retryId,
    },
  };
};

/**
 * Removes all interceptors previously registered by `setupInterceptors`.
 */
export const removeInterceptors = (
  instance: AxiosInstance,
  ids: InterceptorIds,
): void => {
  instance.interceptors.request.eject(ids.request.headers);
  instance.interceptors.request.eject(ids.request.params);
  instance.interceptors.request.eject(ids.request.auth);

  instance.interceptors.response.eject(ids.response.errorNormalizer);
  instance.interceptors.response.eject(ids.response.unauthorizedHandler);
  instance.interceptors.response.eject(ids.response.retry);
};
