/**
 * Open Insights ID (oiid) utilities
 * Provides consistent ID generation for testing, analytics, and debugging
 * @module utils/oiid
 */

/**
 * Separator used between base oiid and slot name
 */
export const OIID_SEPARATOR = '__';

/**
 * Generates a slot-specific oiid from a base oiid
 *
 * @example
 * slotOiid('checkout-submit', 'startIcon') // => 'checkout-submit__startIcon'
 * slotOiid('form-field', 'label') // => 'form-field__label'
 *
 * @param baseOiid - The base oiid of the parent component
 * @param slotName - The name of the slot
 * @returns Combined oiid for the slot, or undefined if baseOiid is not provided
 */
export function slotOiid(baseOiid: string | undefined, slotName: string): string | undefined {
  if (!baseOiid) return undefined;
  return `${baseOiid}${OIID_SEPARATOR}${slotName}`;
}

/**
 * Validates if a string is a valid oiid format
 * Valid oiids start with a letter and contain only alphanumeric characters and hyphens
 *
 * @example
 * isValidOiid('checkout-submit') // => true
 * isValidOiid('123-invalid') // => false
 * isValidOiid('valid_id') // => false (underscore not allowed except in slot separator)
 *
 * @param oiid - The oiid to validate
 * @returns true if the oiid is valid
 */
export function isValidOiid(oiid: string): boolean {
  // Must start with a letter, then alphanumeric and hyphens
  // Allow double underscore for slot oiids
  return /^[a-z][a-z0-9-]*(__[a-z][a-z0-9-]*)?$/i.test(oiid);
}

/**
 * Parses a slot oiid into its base and slot parts
 *
 * @example
 * parseSlotOiid('checkout-submit__startIcon')
 * // => { base: 'checkout-submit', slot: 'startIcon' }
 *
 * parseSlotOiid('checkout-submit')
 * // => { base: 'checkout-submit', slot: undefined }
 *
 * @param oiid - The oiid to parse
 * @returns Object with base and slot parts
 */
export function parseSlotOiid(oiid: string): { base: string; slot?: string } {
  const parts = oiid.split(OIID_SEPARATOR);
  return {
    base: parts[0],
    slot: parts[1],
  };
}

/**
 * Creates a oiid generator for a component, useful for consistent ID generation
 *
 * @example
 * const id = createOiidGenerator('modal');
 * id('trigger') // => 'modal__trigger'
 * id('content') // => 'modal__content'
 *
 * @param baseOiid - The base oiid for the component
 * @returns Function that generates slot oiids
 */
export function createOiidGenerator(baseOiid: string | undefined) {
  return (slotName: string): string | undefined => slotOiid(baseOiid, slotName);
}

/**
 * Type for props that include oiid
 */
export interface WithOiid {
  /** Open Insights ID for testing and analytics */
  oiid?: string;
}

/**
 * Type for slot props that include baseOiid
 */
export interface WithBaseOiid {
  /** Base Open Insights ID from parent component */
  baseOiid?: string;
}

