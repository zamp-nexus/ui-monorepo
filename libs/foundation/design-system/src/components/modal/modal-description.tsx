/**
 * Modal.Description sub-component
 * @module components/modal
 */
import React from 'react';

import { Dialog } from '@base-ui/react/dialog';

import { useTheme } from '../../theme';
import type { ModalDescriptionProps } from './modal';
import { modalDefaultTheme } from './modal';
import { useModalContext } from './modal.context';

/**
 * Modal.Description component
 *
 * Description text for the modal. Connected to Dialog.Description for accessibility.
 */
export const ModalDescription: React.FC<ModalDescriptionProps> = ({
  children,
  className,
  oiid,
}) => {
  const theme = useTheme('modal', modalDefaultTheme);
  const { descriptionId } = useModalContext();

  return (
    <Dialog.Description
      id={descriptionId}
      className={theme.description?.({ className }) ?? className}
      data-oiid={oiid}
      data-slot="description"
    >
      {children}
    </Dialog.Description>
  );
};

ModalDescription.displayName = 'Modal.Description';
