/**
 * Switch component using Base UI
 * @module components/switch
 */
import React from 'react';

import { Switch as SwitchPrimitive } from '@base-ui/react/switch';

import { useTheme } from '../../theme';
import type { SwitchComponent, SwitchProps } from './types';
import { switchDefaultTheme } from './types';

/**
 * Switch component
 *
 * An accessible toggle switch component built on Base UI primitives.
 *
 * @example
 * // Basic usage
 * <Switch />
 *
 * @example
 * // Controlled
 * <Switch checked={enabled} onCheckedChange={setEnabled} />
 *
 * @example
 * // With label
 * <label className="flex items-center gap-2">
 *   <Switch id="notifications" />
 *   <span>Enable notifications</span>
 * </label>
 */
export const Switch: SwitchComponent = React.forwardRef<HTMLButtonElement, SwitchProps>(
  function Switch(
    {
      className,
      ozid,
      size = 'md',
      disabled,
      checked,
      defaultChecked,
      onCheckedChange,
      required,
      name,
      id,
    },
    ref,
  ) {
    const theme = useTheme('switch', switchDefaultTheme);

    return (
      <SwitchPrimitive.Root
        ref={ref}
        className={theme.root({ className, size, disabled, checked: !!checked })}
        data-ozid={ozid}
        disabled={disabled}
        checked={checked}
        defaultChecked={defaultChecked}
        onCheckedChange={onCheckedChange}
        required={required}
        name={name}
        id={id}
      >
        <SwitchPrimitive.Thumb
          className={theme.thumb?.({ size }) ?? ''}
          data-ozid={ozid ? `${ozid}__thumb` : undefined}
        />
      </SwitchPrimitive.Root>
    );
  },
) as SwitchComponent;

Switch.displayName = 'Switch';
