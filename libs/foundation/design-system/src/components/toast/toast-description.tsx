/**
 * Toast.Description sub-component
 * @module components/toast
 */
import React from 'react';

import { useTheme } from '../../theme';
import type { ToastDescriptionProps } from './toast';
import { toastDefaultTheme } from './toast';

/**
 * Toast.Description component
 *
 * Description text for the toast notification
 */
export const ToastDescription: React.FC<ToastDescriptionProps> = ({
  children,
  className,
  oiid,
}) => {
  const theme = useTheme('toast', toastDefaultTheme);

  return (
    <p
      className={theme.description?.({ className, feedback: 'info' }) ?? className}
      data-oiid={oiid}
      data-slot="description"
    >
      {children}
    </p>
  );
};

ToastDescription.displayName = 'Toast.Description';
