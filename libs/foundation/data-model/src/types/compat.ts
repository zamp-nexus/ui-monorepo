/**
 * Compatibility types — kept for backward compatibility only.
 *
 * These types are **deprecated** and will be removed in a future major version.
 * Prefer the newer alternatives listed in each type's JSDoc.
 *
 * @module types/compat
 * @deprecated Use `ValidationResult` from `validation.types.ts` instead.
 */

// =============================================================================
// SimpleValidationResult (deprecated)
// =============================================================================

/**
 * Simple validation result with error messages only.
 *
 * @deprecated Use {@link import('./validation.types').ValidationResult | ValidationResult}
 * from `validation.types.ts` which provides structured issues with severity,
 * paths, and suggestions.
 *
 * @example
 * ```typescript
 * // Old (deprecated):
 * const result: SimpleValidationResult = { valid: false, errors: ['timeout must be non-negative'] };
 *
 * // New (preferred):
 * const result = ValidationResult.fail([
 *   { message: 'timeout must be non-negative', severity: 'error', path: ['timeout'] },
 * ]);
 * ```
 */
export interface SimpleValidationResult {
  /** Whether the validation passed */
  readonly valid: boolean;
  /** Array of validation error messages (empty if valid) */
  readonly errors: readonly string[];
}
