/**
 * Modal.Title sub-component
 * @module components/modal
 */
import React from 'react';

import { Dialog } from '@base-ui/react/dialog';

import { useTheme } from '../../theme';
import type { ModalTitleProps } from './modal';
import { modalDefaultTheme } from './modal';
import { useModalContext } from './modal.context';

/**
 * Modal.Title component
 *
 * Title text for the modal. Connected to Dialog.Title for accessibility.
 */
export const ModalTitle: React.FC<ModalTitleProps> = ({ children, className, oiid }) => {
  const theme = useTheme('modal', modalDefaultTheme);
  const { titleId } = useModalContext();

  return (
    <Dialog.Title
      id={titleId}
      className={theme.title?.({ className }) ?? className}
      data-oiid={oiid}
      data-slot="title"
    >
      {children}
    </Dialog.Title>
  );
};

ModalTitle.displayName = 'Modal.Title';
