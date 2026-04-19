/**
 * SelectContent component
 * @module components/select/content
 */
import React from 'react';

import { Select as SelectPrimitive } from '@base-ui/react/select';

import { useTheme } from '../../theme';
import { useSelectContext } from './select.context';
import type { SelectContentComponent, SelectContentProps } from './types';
import { selectDefaultTheme } from './types';

/**
 * SelectContent component
 *
 * The dropdown content container for select items.
 */
export const SelectContent: SelectContentComponent = React.forwardRef<
  HTMLDivElement,
  SelectContentProps
>(function SelectContent(
  {
    className,
    ozid: propOzid,
    children,
    side = 'bottom',
    align = 'start',
    sideOffset = 4,
    ...rest
  },
  ref: React.ForwardedRef<HTMLDivElement>,
) {
  const { size, ozid: contextOzid } = useSelectContext();
  const theme = useTheme('select', selectDefaultTheme);
  const ozid = propOzid ?? (contextOzid ? `${contextOzid}__content` : undefined);

  return (
    <SelectPrimitive.Portal>
      <SelectPrimitive.Positioner side={side} align={align} sideOffset={sideOffset}>
        <SelectPrimitive.Popup
          ref={ref}
          className={theme.content?.({ className, size }) ?? ''}
          data-ozid={ozid}
          {...rest}
        >
          <div className="p-1">{children}</div>
        </SelectPrimitive.Popup>
      </SelectPrimitive.Positioner>
    </SelectPrimitive.Portal>
  );
}) as SelectContentComponent;

SelectContent.displayName = 'SelectContent';
