/**
 * SideNav.Item sub-component
 * @module components/side-nav
 */
import React from 'react';

import { Slot } from '../../primitives/slot';
import { useTheme } from '../../theme';
import type { SideNavItemComponent, SideNavItemProps } from './types';
import { sideNavDefaultTheme } from './types';

/**
 * SideNav.Item component
 *
 * One destination in the navigation rail.
 *
 * `aria-current="page"` rather than a styled state alone: the active item has
 * to be announced, not only coloured.
 */
export const SideNavItem = React.forwardRef(function SideNavItem<
  T extends React.ElementType = 'a',
>(
  { component, className, children, ozid, icon, active, ...rest }: SideNavItemProps<T>,
  ref: React.ForwardedRef<Element>,
) {
  const theme = useTheme('sideNav', sideNavDefaultTheme);
  const Element = component ?? 'a';

  return (
    <Element
      ref={ref}
      className={theme.item?.({ className, active: Boolean(active) }) ?? className}
      data-ozid={ozid}
      data-slot="item"
      aria-current={active ? 'page' : undefined}
      {...rest}
    >
      {icon && (
        <Slot
          baseOzid={ozid}
          className={theme.itemIcon?.({}) ?? ''}
          slotName="itemIcon"
          slot={icon}
          component="span"
          aria-hidden="true"
        />
      )}
      {children}
    </Element>
  );
}) as unknown as SideNavItemComponent;

SideNavItem.displayName = 'SideNav.Item';
