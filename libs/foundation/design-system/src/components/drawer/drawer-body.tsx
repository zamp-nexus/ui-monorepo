/**
 * Drawer.Body sub-component
 * @module components/drawer
 */
import React from 'react';

import { useTheme } from '../../theme';
import type { DrawerBodyProps } from './drawer';
import { drawerDefaultTheme } from './drawer';

/**
 * Drawer.Body component
 *
 * Scrollable container for the main drawer content.
 */
export const DrawerBody: React.FC<DrawerBodyProps> = ({ children, className, oiid }) => {
  const theme = useTheme('drawer', drawerDefaultTheme);

  return (
    <div className={theme.body?.({ className }) ?? className} data-oiid={oiid} data-slot="body">
      {children}
    </div>
  );
};

DrawerBody.displayName = 'Drawer.Body';
