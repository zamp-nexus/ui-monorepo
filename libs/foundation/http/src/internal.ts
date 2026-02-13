/**
 * Foundation HTTP — Internal Exports
 *
 * Extended API surface for sibling foundation libraries.
 * Application code should import from the public entry point instead.
 *
 * @module foundation-http/internal
 */

// =============================================================================
// Public API (re-exported verbatim)
// =============================================================================

export {
  // Types
  type HttpClientConfig,
  type HttpRetryConfig,
  type AuthConfig,
  type ClientHeadersConfig,
  type ResolvedHttpConfig,
  type HttpContextValue,
  type HttpProviderProps,
  type HttpMethod,
  // Constants
  DEFAULT_TIMEOUT_MS,
  UPLOAD_TIMEOUT_MS,
  DOWNLOAD_TIMEOUT_MS,
  DEFAULT_HTTP_RETRY_CONFIG,
  DEFAULT_AUTH_CONFIG,
  HTTP_HEADERS,
  CLIENT_HEADERS,
  CONTENT_TYPES,
  HTTP_STATUS,
  HTTP_ERROR_CODE,
  type HttpErrorCode,
  PARAMS_ARRAY_FORMAT,
  type ParamsArrayFormat,
  SERIALIZATION_OPERATION,
  type SerializationOperation,
  AXIOS_ERROR_CODE,
  // Provider & Hooks
  HttpProvider,
  HttpContext,
  useHttpContext,
  useHttp,
  // Error Classes
  HttpError,
  HttpNotInitializedError,
  HttpRequestError,
  HttpTimeoutError,
  HttpNetworkError,
  HttpCancelledError,
  HttpUnauthorizedError,
  HttpForbiddenError,
  HttpNotFoundError,
  HttpServerError,
  HttpConfigError,
  HttpSerializationError,
  // Type Guards
  isHttpError,
  hasHttpErrorCode,
  isHttpNotInitializedError,
  isHttpRequestError,
  isHttpTimeoutError,
  isHttpNetworkError,
  isHttpCancelledError,
  isHttpUnauthorizedError,
  isHttpForbiddenError,
  isHttpNotFoundError,
  isHttpServerError,
  isHttpConfigError,
  isHttpSerializationError,
  isAuthenticationError,
  isClientError,
  isServerError,
  isRetryableHttpError,
  isNonRetryableHttpError,
  // Instance Factory & Management
  createAxiosInstance,
  createConfiguredAxiosInstance,
  resolveHttpConfig,
  httpInstanceManager,
  getDefaultAxiosInstance,
  getAxiosInstance,
} from './index';

// =============================================================================
// Internal Types
// =============================================================================

export type { HttpInternals } from './core/types';

// =============================================================================
// Internal Provider & Hooks
// =============================================================================

export { HttpInternalsContext, useHttpInternalsContext } from './provider/http-internals-context';
export { useHttpInternals, useGetAccessToken } from './hooks/use-http-internals';

// =============================================================================
// Interceptors (for custom configurations)
// =============================================================================

export {
  setupInterceptors,
  removeInterceptors,
  type InterceptorIds,
  type SetupInterceptorsOptions,
} from './interceptors/setup';

export {
  createAuthInterceptor,
  setupAuthInterceptor,
  type AuthInterceptorOptions,
} from './interceptors/request/auth-interceptor';

export {
  createHeadersInterceptor,
  setupHeadersInterceptor,
  type HeadersInterceptorOptions,
} from './interceptors/request/headers-interceptor';

export {
  createParamsInterceptor,
  setupParamsInterceptor,
  createParamsSerializer,
  type ParamsInterceptorOptions,
} from './interceptors/request/params-interceptor';

export {
  createErrorNormalizerInterceptor,
  setupErrorNormalizerInterceptor,
  convertAxiosError,
  convertResponseError,
  type ErrorNormalizerOptions,
} from './interceptors/response/error-normalizer';

export {
  createUnauthorizedHandlerInterceptor,
  setupUnauthorizedHandlerInterceptor,
  type UnauthorizedHandlerOptions,
} from './interceptors/response/unauthorized-handler';

export {
  createRetryInterceptor,
  setupRetryInterceptor,
  getRetryCount,
  getRetryDuration,
  type RetryInterceptorOptions,
} from './interceptors/response/retry-interceptor';
