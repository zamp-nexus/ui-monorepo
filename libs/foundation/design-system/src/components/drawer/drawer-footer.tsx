/**
 * Drawer.Footer sub-component
 * @module components/drawer
 */
import React from 'react';

import { useTheme } from '../../theme';
import type { DrawerFooterProps } from './drawer';
import { drawerDefaultTheme } from './drawer';

/**
 * Drawer.Footer component
 *
 * Container for action buttons at the bottom of the drawer.
 */
export const DrawerFooter: React.FC<DrawerFooterProps> = ({
  children,
  className,
  oiid,
}) => {
  const theme = useTheme('drawer', drawerDefaultTheme);

  return (
    <div
      className={theme.footer?.({ className }) ?? className}
      data-oiid={oiid}
      data-slot="footer"
    >
      {children}
    </div>
  );
};

DrawerFooter.displayName = 'Drawer.Footer';
