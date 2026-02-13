/**
 * Slot component type definitions
 * @module primitives/slot/types
 */

import type { OIComponentSlotProps, PolymorphicProps, PolymorphicRef } from '../../types';

/**
 * Default element type for Slot
 */
export type SlotDefaultElement = 'div';

/**
 * Slot's own props
 */
export interface SlotOwnProps {
  /** Base oiid from parent component */
  baseOiid?: string;
  /** Custom oiid (overrides generated oiid from baseOiid + slotName) */
  oiid?: string;
  /** Name of the slot (required for proper slot identification) */
  slotName?: string;
  /** Slot prop value (can be React node or config object) */
  slot?: OIComponentSlotProps;
  /** Children to render if slot is not provided */
  children?: React.ReactNode;
}

/**
 * Props for the Slot component with polymorphism support
 */
export type SlotProps<T extends React.ElementType = SlotDefaultElement> = PolymorphicProps<
  T,
  SlotOwnProps
>;

/**
 * Slot component ref type
 */
export type SlotRef<T extends React.ElementType = SlotDefaultElement> = PolymorphicRef<T>;

/**
 * Slot component type (polymorphic with forwardRef)
 */
export interface SlotComponent {
  <T extends React.ElementType = SlotDefaultElement>(
    props: SlotProps<T> & { ref?: SlotRef<T> },
  ): React.ReactNode;
  displayName?: string;
}

