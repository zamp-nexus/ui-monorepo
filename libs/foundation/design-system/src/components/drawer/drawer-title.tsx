/**
 * Drawer.Title sub-component
 * @module components/drawer
 */
import React from 'react';

import { Dialog } from '@base-ui/react/dialog';

import { useTheme } from '../../theme';
import type { DrawerTitleProps } from './drawer';
import { drawerDefaultTheme } from './drawer';
import { useDrawerContext } from './drawer.context';

/**
 * Drawer.Title component
 *
 * Title text for the drawer.
 */
export const DrawerTitle: React.FC<DrawerTitleProps> = ({ children, className, oiid }) => {
  const theme = useTheme('drawer', drawerDefaultTheme);
  const { titleId } = useDrawerContext();

  return (
    <Dialog.Title
      id={titleId}
      className={theme.title?.({ className }) ?? className}
      data-oiid={oiid}
      data-slot="title"
    >
      {children}
    </Dialog.Title>
  );
};

DrawerTitle.displayName = 'Drawer.Title';
