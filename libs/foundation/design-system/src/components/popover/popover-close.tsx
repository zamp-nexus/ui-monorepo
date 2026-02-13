/**
 * Popover.Close sub-component
 * @module components/popover
 */
import React from 'react';

import { Popover as PopoverPrimitive } from '@base-ui/react/popover';

import { Icon } from '@open-insights-web/foundation-icons';

import { useTheme } from '../../theme';
import type { PopoverCloseProps } from './popover';
import { popoverDefaultTheme } from './popover';

/**
 * Popover.Close component
 *
 * Button that closes the popover.
 */
export const PopoverClose: React.FC<PopoverCloseProps> = ({
  children,
  className,
  oiid,
  ...rest
}) => {
  const theme = useTheme('popover', popoverDefaultTheme);

  return (
    <PopoverPrimitive.Close
      className={className || theme.close?.({}) || ''}
      data-oiid={oiid}
      data-slot="close"
      aria-label="Close"
      {...rest}
    >
      {children || <Icon name="x" size="xs" />}
    </PopoverPrimitive.Close>
  );
};

PopoverClose.displayName = 'Popover.Close';
