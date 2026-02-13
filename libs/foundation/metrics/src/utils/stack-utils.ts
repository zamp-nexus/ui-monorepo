/**
 * Stack Trace Utilities
 *
 * Shared stack trace sanitization used by foundation-metrics and error-instrumentation.
 *
 * @module utils/stack-utils
 */

/**
 * Sanitize a stack trace by limiting depth
 */
export const sanitizeStackTrace = (stack?: string, maxDepth = 50): string => {
  if (!stack) {
    return '';
  }

  const lines = stack.split('\n');
  return lines.slice(0, maxDepth + 1).join('\n');
};
