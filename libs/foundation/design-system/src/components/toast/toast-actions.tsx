/**
 * Toast.Actions sub-component
 * @module components/toast
 */
import React from 'react';

import { useTheme } from '../../theme';
import type { ToastActionsProps } from './toast';
import { toastDefaultTheme } from './toast';

/**
 * Toast.Actions component
 *
 * Container for action buttons in the toast
 */
export const ToastActions: React.FC<ToastActionsProps> = ({ children, className, oiid }) => {
  const theme = useTheme('toast', toastDefaultTheme);

  return (
    <div
      className={theme.actions?.({ className }) ?? className}
      data-oiid={oiid}
      data-slot="actions"
    >
      {children}
    </div>
  );
};

ToastActions.displayName = 'Toast.Actions';
