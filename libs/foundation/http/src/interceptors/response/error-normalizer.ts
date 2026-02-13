/**
 * Error Normalizer Response Interceptor
 *
 * Converts axios errors and non-2xx responses into typed HttpError instances.
 * This interceptor runs LAST in the response chain so that retry and
 * unauthorized-handler can operate on raw responses/AxiosErrors first.
 *
 * @module interceptors/response/error-normalizer
 */

import type { AxiosInstance, AxiosResponse, AxiosError } from 'axios';
import { isAxiosError } from 'axios';
import { HTTP_STATUS, AXIOS_ERROR_CODE } from '../../core/constants';
import {
  HttpRequestError,
  HttpTimeoutError,
  HttpNetworkError,
  HttpCancelledError,
  HttpUnauthorizedError,
  HttpForbiddenError,
  HttpNotFoundError,
  HttpServerError,
} from '../../errors/http-errors';

// =============================================================================
// Types
// =============================================================================

export interface ErrorNormalizerOptions {
  readonly debug?: boolean;
}

// =============================================================================
// Shared Status-to-Error Mapping
// =============================================================================

/**
 * Extracts a human-readable error message from an HTTP response body.
 * Supports common API error shapes: `{ message }`, `{ error }`,
 * `{ errorMessage }`, `{ errors: [{ message }] }`.
 */
const extractErrorMessage = (response: AxiosResponse): string | undefined => {
  const data = response.data as unknown;

  if (typeof data === 'string') {
    return data;
  }

  if (data && typeof data === 'object') {
    const obj = data as Record<string, unknown>;
    if (typeof obj.message === 'string') return obj.message;
    if (typeof obj.error === 'string') return obj.error;
    if (typeof obj.errorMessage === 'string') return obj.errorMessage;
    if (Array.isArray(obj.errors)) {
      const first = obj.errors[0] as Record<string, unknown> | undefined;
      if (first && typeof first.message === 'string') return first.message;
    }
  }

  return undefined;
};

/**
 * Maps an HTTP status code to the appropriate HttpError subclass.
 * Used by both the fulfilled (non-2xx response) and rejected (AxiosError with
 * response) code paths to avoid duplicating the switch logic.
 */
const mapStatusToError = (
  status: number,
  message: string,
  url: string | undefined,
  method: string | undefined,
  cause?: Error,
): Error => {
  switch (status) {
    case HTTP_STATUS.UNAUTHORIZED:
      return new HttpUnauthorizedError(url, method, cause);
    case HTTP_STATUS.FORBIDDEN:
      return new HttpForbiddenError(url, method, cause);
    case HTTP_STATUS.NOT_FOUND:
      return new HttpNotFoundError(url, method, cause);
    default:
      if (status >= 500) {
        return new HttpServerError(status, message, url, method, cause);
      }
      return new HttpRequestError(message, status, url, method, cause);
  }
};

// =============================================================================
// Conversion Functions
// =============================================================================

/**
 * Converts a raw AxiosError (network / timeout / cancelled) into an HttpError.
 * If the AxiosError contains a response, delegates to `mapStatusToError`.
 */
export const convertAxiosError = (error: AxiosError): Error => {
  const url = error.config?.url;
  const method = error.config?.method?.toUpperCase();

  if (error.code === AXIOS_ERROR_CODE.CANCELLED) {
    return new HttpCancelledError(url, method, error);
  }

  if (error.code === AXIOS_ERROR_CODE.TIMEOUT || error.code === AXIOS_ERROR_CODE.TIMEOUT_ALT) {
    const timeout = error.config?.timeout ?? 0;
    return new HttpTimeoutError(timeout, url, method, error);
  }

  if (error.code === AXIOS_ERROR_CODE.NETWORK || !error.response) {
    return new HttpNetworkError(error.message, url, method, error);
  }

  const { status } = error.response;
  const message = extractErrorMessage(error.response as AxiosResponse) ?? error.message;
  return mapStatusToError(status, message, url, method, error);
};

/**
 * Converts a non-2xx fulfilled response (status >= 400) into an HttpError.
 * Only called when `validateStatus: () => true` lets all statuses through.
 */
export const convertResponseError = (response: AxiosResponse): Error => {
  const url = response.config?.url;
  const method = response.config?.method?.toUpperCase();
  const { status } = response;
  const message = extractErrorMessage(response) ?? `HTTP ${status}`;
  return mapStatusToError(status, message, url, method);
};

// =============================================================================
// Interceptor
// =============================================================================

/**
 * Creates the error normalizer response interceptor.
 *
 * - `onFulfilled`: throws when `response.status >= 400`
 * - `onRejected`: converts raw AxiosError into a typed HttpError
 */
export const createErrorNormalizerInterceptor = (options: ErrorNormalizerOptions = {}) => {
  const { debug } = options;

  const onFulfilled = (response: AxiosResponse): AxiosResponse => {
    if (response.status >= 400) {
      if (debug) {
        console.log('[HttpClient] Response error:', {
          status: response.status,
          url: response.config?.url,
        });
      }
      throw convertResponseError(response);
    }
    return response;
  };

  const onRejected = (error: unknown): never => {
    if (isAxiosError(error)) {
      if (debug) {
        console.log('[HttpClient] Axios error:', {
          code: error.code,
          message: error.message,
          status: error.response?.status,
        });
      }
      throw convertAxiosError(error);
    }

    throw error;
  };

  return { onFulfilled, onRejected };
};

/**
 * Registers the error normalizer interceptor on the given axios instance.
 *
 * @returns Interceptor ID for removal via `instance.interceptors.response.eject`.
 */
export const setupErrorNormalizerInterceptor = (
  instance: AxiosInstance,
  options: ErrorNormalizerOptions = {},
): number => {
  const { onFulfilled, onRejected } = createErrorNormalizerInterceptor(options);
  return instance.interceptors.response.use(onFulfilled, onRejected);
};
