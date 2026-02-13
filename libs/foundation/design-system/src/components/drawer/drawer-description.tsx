/**
 * Drawer.Description sub-component
 * @module components/drawer
 */
import React from 'react';

import { Dialog } from '@base-ui/react/dialog';

import { useTheme } from '../../theme';
import { useDrawerContext } from './drawer.context';
import type { DrawerDescriptionProps } from './drawer';
import { drawerDefaultTheme } from './drawer';

/**
 * Drawer.Description component
 *
 * Description text for the drawer.
 */
export const DrawerDescription: React.FC<DrawerDescriptionProps> = ({
  children,
  className,
  oiid,
}) => {
  const theme = useTheme('drawer', drawerDefaultTheme);
  const { descriptionId } = useDrawerContext();

  return (
    <Dialog.Description
      id={descriptionId}
      className={theme.description?.({ className }) ?? className}
      data-oiid={oiid}
      data-slot="description"
    >
      {children}
    </Dialog.Description>
  );
};

DrawerDescription.displayName = 'Drawer.Description';
