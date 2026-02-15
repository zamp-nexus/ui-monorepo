/**
 * Query-related error classes
 *
 * @module errors/query-errors
 */

import {
  FOUNDATION_ERROR_CODE,
  QueryTimeoutError,
  QueryCancelledError,
  QueryExecutionError,
  CANCELLATION_REASON,
} from '@open-insights-web/foundation-data-model';
import { BridgeError } from './base-error';

// =============================================================================
// SQL Validation Error
// =============================================================================

/**
 * Error thrown when SQL identifier validation fails
 */
export class SqlValidationError extends BridgeError {
  readonly code = FOUNDATION_ERROR_CODE.BRIDGE_SQL_VALIDATION_FAILED;

  constructor(
    readonly identifier: string,
    readonly reason: string
  ) {
    super(`Invalid SQL identifier "${identifier}": ${reason}`, {
      identifier,
      reason,
    });
  }
}

export {
  QueryTimeoutError,
  QueryCancelledError,
  QueryExecutionError,
  CANCELLATION_REASON,
};
export type { CancellationReasonKind } from '@open-insights-web/foundation-data-model';
