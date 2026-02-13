/**
 * Error handler mixin for sync-engine classes
 *
 * Provides a standardized error handling pattern that can be used
 * across all sync-engine components.
 *
 * @module core/error-handler-mixin
 */

import { normalizeError } from '@open-insights-web/foundation-utils';

/**
 * Logger interface for error handler
 */
export interface ErrorLogger {
  error: (...args: unknown[]) => void;
}

/**
 * Error handler mixin interface
 */
export interface ErrorHandlerMixin {
  handleError(error: unknown, context?: string): void;
}

/**
 * Configuration for creating an error handler mixin
 */
export interface ErrorHandlerMixinConfig {
  /** Logger instance with error method */
  logger: ErrorLogger;
  /** Optional external error callback */
  onError?: (error: Error, context?: string) => void;
}

/**
 * Create an error handler mixin
 *
 * Returns an object with a handleError method that can be used
 * to standardize error handling across sync-engine classes.
 *
 * @param config - Configuration for the error handler
 * @returns Error handler mixin object
 *
 * @example
 * ```typescript
 * class MyComponent {
 *   private logger = createDebugLogger('MyComponent', true);
 *   private errorHandler = createErrorHandlerMixin({
 *     logger: this.logger,
 *     onError: (error, ctx) => this.onError?.(error, ctx),
 *   });
 *
 *   private handleError(error: unknown, context?: string): void {
 *     this.errorHandler.handleError(error, context);
 *   }
 * }
 * ```
 */
export const createErrorHandlerMixin = (config: ErrorHandlerMixinConfig): ErrorHandlerMixin => ({
  handleError(error: unknown, context?: string): void {
    const err = normalizeError(error);
    config.logger.error(`Error in ${context ?? 'unknown'}:`, err);
    config.onError?.(err, context);
  }
});

/**
 * Standalone error handler function
 *
 * For cases where you don't need a mixin, just a single-use error handler.
 *
 * @param error - The error to handle
 * @param context - Context string for logging
 * @param config - Error handler configuration
 */
export const handleSyncEngineError = (
  error: unknown,
  context: string,
  config: ErrorHandlerMixinConfig
): void => {
  const err = normalizeError(error);
  config.logger.error(`Error in ${context}:`, err);
  config.onError?.(err, context);
};
