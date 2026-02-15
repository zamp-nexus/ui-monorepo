/**
 * Utility exports
 *
 * For generic utilities, import directly from their source packages:
 * - From '@open-insights-web/foundation-utils': deepFreeze, assert, assertDefined,
 *   isPositiveInteger, isNonNegative, sleep, withTimeout
 * - From '@open-insights-web/foundation-data-model': ValidationResult, ValidationResultData
 *
 * @module utils
 */

export {
  validateIdentifier,
  validateTableName,
  isValidIdentifier,
  quoteIdentifier,
  buildCreateViewSql,
  buildDropViewSql,
  escapeString,
  buildParameterizedSql,
  applyLimitOffset,
} from './sql';

export {
  validatePoolConfig,
  validateRouterConfig,
  resolvePoolConfig,
} from './validation';

export type { RouterConfigForValidation } from './validation';
