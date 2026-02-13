/**
 * Error type guard utilities
 *
 * Provides type guards for identifying specific error types.
 *
 * @module error/error-guards
 */

/**
 * Check if an error is of a specific type by name
 *
 * @param error - Error to check
 * @param name - Error name to match
 * @returns True if error matches the name
 *
 * @example
 * ```typescript
 * try {
 *   await fetch('/api');
 * } catch (e) {
 *   if (isErrorType(e, 'AbortError')) {
 *     // Handle abort
 *   }
 * }
 * ```
 */
export const isErrorType = (error: unknown, name: string): boolean => {
  return error instanceof Error && error.name === name;
};

/**
 * Check if an error is an AbortError (from AbortController)
 *
 * @param error - Error to check
 * @returns True if error is an abort error
 *
 * @example
 * ```typescript
 * const controller = new AbortController();
 * controller.abort();
 *
 * try {
 *   await fetch('/api', { signal: controller.signal });
 * } catch (e) {
 *   if (isAbortError(e)) {
 *     // Request was cancelled - not a real error
 *     return;
 *   }
 *   throw e;
 * }
 * ```
 */
export const isAbortError = (error: unknown): boolean => {
  return isErrorType(error, 'AbortError');
};

/**
 * Network error detection patterns
 *
 * Note: 'timeout' and 'etimedout' are intentionally excluded here
 * so that timeout errors are detected by `isTimeoutError` instead
 * of being swallowed by `isNetworkError`.
 */
const NETWORK_ERROR_PATTERNS: readonly string[] = [
  'network',
  'fetch',
  'failed to fetch',
  'networkerror',
  'connection',
  'offline',
  'econnrefused',
  'enotfound',
  'socket hang up',
] as const;

/**
 * Check if an error is a network error
 *
 * Detects common network-related errors based on message patterns.
 *
 * @param error - Error to check
 * @returns True if error appears to be network-related
 *
 * @example
 * ```typescript
 * try {
 *   await fetch('/api');
 * } catch (e) {
 *   if (isNetworkError(e)) {
 *     // Show offline message
 *     showNotification('You appear to be offline');
 *   }
 * }
 * ```
 */
export const isNetworkError = (error: unknown): boolean => {
  if (!(error instanceof Error)) return false;

  const message = error.message.toLowerCase();
  return NETWORK_ERROR_PATTERNS.some((pattern) => message.includes(pattern));
};

/**
 * Check if an error is a timeout error
 *
 * @param error - Error to check
 * @returns True if error is a timeout error
 */
export const isTimeoutError = (error: unknown): boolean => {
  if (!(error instanceof Error)) return false;

  const message = error.message.toLowerCase();
  return (
    isErrorType(error, 'TimeoutError') ||
    message.includes('timeout') ||
    message.includes('timed out')
  );
};

/**
 * Check if an error is a type error (usually programming mistake)
 *
 * @param error - Error to check
 * @returns True if error is a TypeError
 */
export const isTypeError = (error: unknown): error is TypeError => {
  return error instanceof TypeError;
};

/**
 * Check if an error is a syntax error
 *
 * @param error - Error to check
 * @returns True if error is a SyntaxError
 */
export const isSyntaxError = (error: unknown): error is SyntaxError => {
  return error instanceof SyntaxError;
};

/**
 * Check if an error is a range error
 *
 * @param error - Error to check
 * @returns True if error is a RangeError
 */
export const isRangeError = (error: unknown): error is RangeError => {
  return error instanceof RangeError;
};

/**
 * Check if error has a specific error code
 *
 * @param error - Error to check
 * @param code - Error code to match
 * @returns True if error has matching code
 */
export const hasErrorCode = (error: unknown, code: string | number): boolean => {
  if (!(error instanceof Error)) return false;

  return 'code' in error && (error as Record<string, unknown>).code === code;
};

/**
 * Check if HTTP status code indicates a retriable error
 *
 * @param status - HTTP status code
 * @returns True if the error is potentially retriable
 */
export const isRetriableHttpStatus = (status: number): boolean => {
  return (
    status >= 500 || // Server errors
    status === 408 || // Request Timeout
    status === 429 || // Too Many Requests
    status === 0 // Network error
  );
};
