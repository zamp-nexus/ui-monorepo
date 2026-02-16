/**
 * SelectContent component
 * @module components/select/content
 */
import React from 'react';

import { Select as SelectPrimitive } from '@base-ui/react/select';

import { useTheme } from '../../theme';
import type { SelectContentComponent, SelectContentProps } from './select';
import { selectDefaultTheme } from './select';
import { useSelectContext } from './select.context';

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
    oiid: propOiid,
    children,
    side = 'bottom',
    align = 'start',
    sideOffset = 4,
    ...rest
  },
  ref: React.ForwardedRef<HTMLDivElement>,
) {
  const { size, oiid: contextOiid } = useSelectContext();
  const theme = useTheme('select', selectDefaultTheme);
  const oiid = propOiid ?? (contextOiid ? `${contextOiid}__content` : undefined);

  return (
    <SelectPrimitive.Portal>
      <SelectPrimitive.Positioner side={side} align={align} sideOffset={sideOffset}>
        <SelectPrimitive.Popup
          ref={ref}
          className={theme.content?.({ className, size }) ?? ''}
          data-oiid={oiid}
          {...rest}
        >
          <div className="p-1">{children}</div>
        </SelectPrimitive.Popup>
      </SelectPrimitive.Positioner>
    </SelectPrimitive.Portal>
  );
}) as SelectContentComponent;

SelectContent.displayName = 'SelectContent';
