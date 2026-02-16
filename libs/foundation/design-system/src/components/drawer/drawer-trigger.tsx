/**
 * Drawer.Trigger sub-component
 * @module components/drawer
 */
import React from 'react';

import { Dialog } from '@base-ui/react/dialog';

import type { DrawerTriggerProps } from './drawer';

/**
 * Drawer.Trigger component
 *
 * Button that opens the drawer.
 */
export const DrawerTrigger: React.FC<DrawerTriggerProps> = ({
  children,
  className,
  oiid,
  ...rest
}) => {
  return (
    <Dialog.Trigger className={className} data-oiid={oiid} data-slot="trigger" {...rest}>
      {children}
    </Dialog.Trigger>
  );
};

DrawerTrigger.displayName = 'Drawer.Trigger';
