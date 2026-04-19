/**
 * Drawer.Content sub-component
 * @module components/drawer
 */
import React from 'react';

import { Dialog } from '@base-ui/react/dialog';

import { useTheme } from '../../theme';
import { cn } from '../../utils/cn';
import { useDrawerContext } from './drawer.context';
import type { DrawerContentProps } from './types';
import { drawerDefaultTheme } from './types';

/**
 * Get size class based on direction and size
 */
function getSizeClass(
  direction: 'left' | 'right' | 'top' | 'bottom',
  size: 'auto' | '1/3' | '1/2' | '2/3' | 'full',
): string {
  const isHorizontal = direction === 'left' || direction === 'right';

  const sizeClasses = {
    auto: isHorizontal ? 'w-auto max-w-[80vw]' : 'h-auto max-h-[80vh]',
    '1/3': isHorizontal ? 'w-1/3' : 'h-1/3',
    '1/2': isHorizontal ? 'w-1/2' : 'h-1/2',
    '2/3': isHorizontal ? 'w-2/3' : 'h-2/3',
    full: isHorizontal ? 'w-full' : 'h-full',
  };

  return sizeClasses[size];
}

/**
 * Drawer.Content component
 *
 * Container for the drawer content. Renders backdrop and sliding panel.
 */
export const DrawerContent: React.FC<DrawerContentProps> = ({ children, className, ozid }) => {
  const theme = useTheme('drawer', drawerDefaultTheme);
  const { direction, size, titleId, descriptionId } = useDrawerContext();

  const sizeClass = getSizeClass(direction, size);

  return (
    <Dialog.Portal>
      <Dialog.Backdrop
        className={theme.backdrop?.({}) ?? ''}
        data-ozid={ozid ? `${ozid}__backdrop` : undefined}
      />
      <Dialog.Popup
        className={cn(theme.popup?.({ direction }) ?? '', sizeClass, className)}
        data-ozid={ozid}
        data-slot="content"
        data-direction={direction}
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
      >
        {children}
      </Dialog.Popup>
    </Dialog.Portal>
  );
};

DrawerContent.displayName = 'Drawer.Content';
