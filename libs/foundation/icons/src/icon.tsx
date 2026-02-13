import React from 'react';

import clsx from 'clsx';

import { ICON_SIZE_MAPPER } from './constants';
import type { IconProps } from './icon';
import { getAllIconNames, getIcon } from './icons/registry';

/**
 * Icon component that wraps lucide-react icons with Tailwind-driven sizing and styling
 *
 * @example
 * ```tsx
 * <Icon name="home" size="lg" className="text-blue-500" />
 * <Icon name="search" onClick={handleClick} aria-label="Search" />
 * ```
 */
export const Icon = React.forwardRef<HTMLElement, IconProps>(function Icon(
  {
    name,
    size = 'base',
    className,
    iconClassName,
    strokeWidth = 2,
    onClick,
    style,
    'data-testid': testId,
    'aria-label': ariaLabel,
    'aria-hidden': ariaHidden = true,
    ...rest
  },
  ref,
) {
  const IconComponent = getIcon(name);

  if (!IconComponent) {
    // In development, show a helpful error
    if (process.env.NODE_ENV !== 'production') {
      console.warn(
        `Icon "${name}" is not registered. Available icons: ${getAllIconNames().join(', ')}`,
      );
    }
    return null;
  }

  return (
    <i
      ref={ref}
      className={clsx(ICON_SIZE_MAPPER[size], 'flex justify-center items-center', className)}
      onClick={onClick}
      style={style}
      data-testid={testId}
      aria-label={ariaLabel}
      aria-hidden={ariaHidden && !ariaLabel ? true : undefined}
      {...rest}
    >
      <IconComponent className={clsx('w-full h-full', iconClassName)} strokeWidth={strokeWidth} />
    </i>
  );
});

Icon.displayName = 'Icon';
