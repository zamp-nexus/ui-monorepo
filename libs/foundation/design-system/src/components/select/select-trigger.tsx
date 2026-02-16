/**
 * SelectTrigger component
 * @module components/select/trigger
 */
import React from 'react';

import { Select as SelectPrimitive } from '@base-ui/react/select';

import { Icon } from '@open-insights-web/foundation-icons';

import { useTheme } from '../../theme';
import type { SelectTriggerComponent, SelectTriggerProps } from './select';
import { selectDefaultTheme } from './select';
import { useSelectContext } from './select.context';

/**
 * SelectTrigger component
 *
 * The trigger button that opens the select dropdown.
 */
export const SelectTrigger: SelectTriggerComponent = React.forwardRef<
  HTMLButtonElement,
  SelectTriggerProps
>(function SelectTrigger(
  { className, oiid: propOiid, children, placeholder, ...rest },
  ref: React.ForwardedRef<HTMLButtonElement>,
) {
  const { size, disabled, oiid: contextOiid } = useSelectContext();
  const theme = useTheme('select', selectDefaultTheme);
  const oiid = propOiid ?? (contextOiid ? `${contextOiid}__trigger` : undefined);

  return (
    <SelectPrimitive.Trigger
      ref={ref}
      className={theme.trigger?.({ className, size }) ?? ''}
      data-oiid={oiid}
      disabled={disabled}
      {...rest}
    >
      <SelectPrimitive.Value placeholder={placeholder}>{children}</SelectPrimitive.Value>
      <SelectPrimitive.Icon>
        <Icon name="chevron-down" size="sm" className="opacity-50" />
      </SelectPrimitive.Icon>
    </SelectPrimitive.Trigger>
  );
}) as SelectTriggerComponent;

SelectTrigger.displayName = 'SelectTrigger';
