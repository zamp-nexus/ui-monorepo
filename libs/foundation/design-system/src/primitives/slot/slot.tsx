/**
 * Slot component - Renders named slots for design system components
 * @module primitives/slot
 */
import React from 'react';

import { cn } from '../../utils/cn';
import { slotOiid } from '../../utils/oiid';
import {
  getSlotChildren,
  getSlotClassName,
  getSlotComponent,
  isReactNode,
  isSlotConfig,
} from '../../utils/slot-helpers';
import type { SlotComponent, SlotDefaultElement, SlotProps } from './slot';

/**
 * Slot component
 *
 * Renders a slot for a design system component. Supports:
 * - React nodes as children
 * - Configuration objects with component/children/className
 * - Automatic oiid generation for testing
 *
 * @example
 * // Simple slot with React node
 * <Slot slotName="startIcon" slot={<Icon />} baseOiid="button-1" />
 *
 * @example
 * // Slot with configuration
 * <Slot
 *   slotName="startIcon"
 *   slot={{ component: 'span', children: <Icon />, className: 'custom' }}
 *   baseOiid="button-1"
 * />
 *
 * @example
 * // Slot with default children
 * <Slot slotName="indicator" baseOiid="checkbox-1" component="span">
 *   <CheckIcon />
 * </Slot>
 */
export const Slot = React.forwardRef(function Slot<
  T extends React.ElementType = SlotDefaultElement,
>(
  {
    baseOiid,
    oiid: customOiid,
    slotName,
    slot,
    component,
    className,
    children,
    ...rest
  }: SlotProps<T>,
  ref: React.ForwardedRef<Element>,
) {
  // Generate oiid for the slot
  const oiid = customOiid ?? (slotName ? slotOiid(baseOiid, slotName) : undefined);

  // Get children from slot prop or use provided children
  let slotChildren = children;
  if (slot !== undefined) {
    if (isSlotConfig(slot)) {
      slotChildren = getSlotChildren(slot) ?? children;
    } else if (Array.isArray(slot)) {
      slotChildren = slot.filter((element) => isReactNode(element));
    } else if (isReactNode(slot)) {
      slotChildren = slot;
    }
  }

  // Determine className
  let finalClassName = className;
  if (slot !== undefined && isSlotConfig(slot)) {
    const slotClassName = getSlotClassName(slot);
    // Check for overrideClassName
    if ('overrideClassName' in slot && slot.overrideClassName) {
      finalClassName = slot.overrideClassName as string;
    } else if (slotClassName) {
      finalClassName = cn(className, slotClassName);
    }
  }

  // Determine component to render
  let Element: React.ElementType = component ?? 'div';
  if (slot !== undefined && isSlotConfig(slot)) {
    Element = getSlotComponent(slot, Element);
  }

  return (
    <Element {...rest} ref={ref} className={finalClassName} data-oiid={oiid} data-slot={slotName}>
      {slotChildren}
    </Element>
  );
}) as SlotComponent;

Slot.displayName = 'Slot';
