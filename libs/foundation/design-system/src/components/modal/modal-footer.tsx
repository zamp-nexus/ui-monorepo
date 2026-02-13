/**
 * Modal.Footer sub-component
 * @module components/modal
 */
import React from 'react';

import { useTheme } from '../../theme';
import type { ModalFooterProps } from './modal';
import { modalDefaultTheme } from './modal';

/**
 * Modal.Footer component
 *
 * Container for action buttons at the bottom of the modal.
 */
export const ModalFooter: React.FC<ModalFooterProps> = ({
  children,
  className,
  oiid,
}) => {
  const theme = useTheme('modal', modalDefaultTheme);

  return (
    <div
      className={theme.footer?.({ className }) ?? className}
      data-oiid={oiid}
      data-slot="footer"
    >
      {children}
    </div>
  );
};

ModalFooter.displayName = 'Modal.Footer';
