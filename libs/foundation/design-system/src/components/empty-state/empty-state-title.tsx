/**
 * EmptyState.Title sub-component
 * @module components/empty-state
 */
import React from 'react';

import { useTheme } from '../../theme';
import type { EmptyStateTitleProps } from './empty-state';
import { emptyStateDefaultTheme } from './empty-state';

/**
 * EmptyState.Title component
 *
 * Title text for the empty state
 */
export const EmptyStateTitle: React.FC<EmptyStateTitleProps> = ({ children, className, oiid }) => {
  const theme = useTheme('emptyState', emptyStateDefaultTheme);

  return (
    <h3
      className={theme.title?.({ className, size: 'md' }) ?? className}
      data-oiid={oiid}
      data-slot="title"
    >
      {children}
    </h3>
  );
};

EmptyStateTitle.displayName = 'EmptyState.Title';
