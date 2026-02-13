/**
 * Modal.Body sub-component
 * @module components/modal
 */
import React from 'react';

import { useTheme } from '../../theme';
import type { ModalBodyProps } from './modal';
import { modalDefaultTheme } from './modal';

/**
 * Modal.Body component
 *
 * Scrollable container for the main modal content.
 */
export const ModalBody: React.FC<ModalBodyProps> = ({
  children,
  className,
  oiid,
}) => {
  const theme = useTheme('modal', modalDefaultTheme);

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

ModalBody.displayName = 'Modal.Body';
