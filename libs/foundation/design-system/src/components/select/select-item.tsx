/**
 * SelectItem component
 * @module components/select/item
 */
import React from 'react';

import { Select as SelectPrimitive } from '@base-ui/react/select';

import { Icon } from '@open-insights-web/foundation-icons';

import { useTheme } from '../../theme';
import type { SelectItemComponent, SelectItemProps } from './select';
import { selectDefaultTheme } from './select';
import { useSelectContext } from './select.context';

/**
 * SelectItem component
 *
 * Individual option within a Select.
 */
export const SelectItem: SelectItemComponent = React.forwardRef<HTMLDivElement, SelectItemProps>(
  function SelectItem(
    { className, oiid, children, value, disabled, ...rest },
    ref: React.ForwardedRef<HTMLDivElement>,
  ) {
    const { size } = useSelectContext();
    const theme = useTheme('select', selectDefaultTheme);

    return (
      <SelectPrimitive.Item
        ref={ref}
        className={theme.item?.({ className, size }) ?? ''}
        data-oiid={oiid}
        value={value}
        disabled={disabled}
        {...rest}
      >
        <span className="absolute left-2 flex h-3.5 w-3.5 items-center justify-center">
          <SelectPrimitive.ItemIndicator>
            <Icon name="check" size="sm" />
          </SelectPrimitive.ItemIndicator>
        </span>
        <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
      </SelectPrimitive.Item>
    );
  },
) as SelectItemComponent;

SelectItem.displayName = 'SelectItem';
