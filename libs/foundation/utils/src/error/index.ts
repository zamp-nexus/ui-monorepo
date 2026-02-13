/**
 * Error utilities
 * @module error
 */

export {
  normalizeError,
  formatErrorMessage,
  getErrorMessage,
  getErrorName,
} from './normalize-error';

export {
  isErrorType,
  isAbortError,
  isNetworkError,
  isTimeoutError,
  isTypeError,
  isSyntaxError,
  isRangeError,
  hasErrorCode,
  isRetriableHttpStatus,
} from './error-guards';

export {
  createErrorHandler,
  type ErrorHandlerConfig,
} from './error-handler';
