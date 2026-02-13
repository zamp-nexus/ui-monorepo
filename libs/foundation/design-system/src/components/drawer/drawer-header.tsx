/**
 * Drawer.Header sub-component
 * @module components/drawer
 */
import React from 'react';

import { useTheme } from '../../theme';
import type { DrawerHeaderProps } from './drawer';
import { drawerDefaultTheme } from './drawer';

/**
 * Drawer.Header component
 *
 * Container for the drawer header (title, description, close button).
 */
export const DrawerHeader: React.FC<DrawerHeaderProps> = ({
  children,
  className,
  oiid,
}) => {
  const theme = useTheme('drawer', drawerDefaultTheme);

  return (
    <div
      className={theme.header?.({ className }) ?? className}
      data-oiid={oiid}
      data-slot="header"
    >
      {children}
    </div>
  );
};

DrawerHeader.displayName = 'Drawer.Header';
