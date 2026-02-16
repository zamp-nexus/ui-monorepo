/**
 * Modal.Header sub-component
 * @module components/modal
 */
import React from 'react';

import { useTheme } from '../../theme';
import type { ModalHeaderProps } from './modal';
import { modalDefaultTheme } from './modal';

/**
 * Modal.Header component
 *
 * Container for the modal header (title, description, close button).
 */
export const ModalHeader: React.FC<ModalHeaderProps> = ({ children, className, oiid }) => {
  const theme = useTheme('modal', modalDefaultTheme);

  return (
    <div className={theme.header?.({ className }) ?? className} data-oiid={oiid} data-slot="header">
      {children}
    </div>
  );
};

ModalHeader.displayName = 'Modal.Header';
