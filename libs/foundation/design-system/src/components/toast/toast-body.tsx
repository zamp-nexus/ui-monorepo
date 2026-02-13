/**
 * Toast.Body sub-component
 * @module components/toast
 */
import React from 'react';

import { useTheme } from '../../theme';
import type { ToastBodyProps } from './toast';
import { toastDefaultTheme } from './toast';

/**
 * Toast.Body component
 *
 * Container for custom body content in the toast
 */
export const ToastBody: React.FC<ToastBodyProps> = ({
  children,
  className,
  oiid,
}) => {
  const theme = useTheme('toast', toastDefaultTheme);

  return (
    <div
      className={theme.body?.({ className }) ?? className}
      data-oiid={oiid}
      data-slot="body"
    >
      {children}
    </div>
  );
};

ToastBody.displayName = 'Toast.Body';
