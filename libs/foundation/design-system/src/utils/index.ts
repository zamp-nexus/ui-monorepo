/**
 * OpenInsights Design System - Utilities
 * @module utils
 */

// Class name utilities
export { cn, type ClassValue } from './cn';

// Open Insights ID utilities
export {
  OIID_SEPARATOR,
  slotOiid,
  isValidOiid,
  parseSlotOiid,
  createOiidGenerator,
  type WithOiid,
  type WithBaseOiid,
} from './oiid';

// Slot utilities
export {
  normalizeSlot,
  normalizeSlots,
  getSlotNames,
  getOverridableSlotNames,
  isReactNode,
  isSlotConfig,
  getSlotChildren,
  getSlotComponent,
  getSlotClassName,
} from './slot-helpers';

// Accessibility utilities
export {
  generateA11yId,
  resetA11yIdCounter,
  visuallyHiddenStyles,
  visuallyHiddenClasses,
  shouldShowFocusRing,
  A11yKeys,
  type A11yKey,
  isKey,
  type FocusableElement,
  focusableSelector,
  getFocusableElements,
  trapFocus,
  announceToScreenReader,
  type DisableableProps,
  getDisabledState,
} from './a11y';

// Polymorphic utilities
export {
  getDisplayName,
  createPolymorphicComponent,
  type ExtractPolymorphicProps,
  type ExtractPolymorphicRef,
} from './polymorphic';

