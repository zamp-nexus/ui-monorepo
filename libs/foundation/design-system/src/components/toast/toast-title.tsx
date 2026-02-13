/**
 * Toast.Title sub-component
 * @module components/toast
 */
import React from 'react';

import { useTheme } from '../../theme';
import type { ToastTitleProps } from './toast';
import { toastDefaultTheme } from './toast';

/**
 * Toast.Title component
 *
 * Title text for the toast notification
 */
export const ToastTitle: React.FC<ToastTitleProps> = ({
  children,
  className,
  oiid,
}) => {
  const theme = useTheme('toast', toastDefaultTheme);

  return (
    <div
      className={theme.title?.({ className, feedback: 'info' }) ?? className}
      data-oiid={oiid}
      data-slot="title"
    >
      {children}
    </div>
  );
};

ToastTitle.displayName = 'Toast.Title';
