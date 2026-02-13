/**
 * Modal.Content sub-component
 * @module components/modal
 */
import React from 'react';

import { Dialog } from '@base-ui/react/dialog';

import { useTheme } from '../../theme';
import { useModalContext } from './modal.context';
import type { ModalContentProps } from './modal';
import { modalDefaultTheme } from './modal';

/**
 * Modal.Content component
 *
 * Container for the modal content. Renders backdrop and popup.
 */
export const ModalContent: React.FC<ModalContentProps> = ({
  children,
  className,
  oiid,
}) => {
  const theme = useTheme('modal', modalDefaultTheme);
  const { size, fillContainer, fitContent, titleId, descriptionId } = useModalContext();

  return (
    <Dialog.Portal>
      <Dialog.Backdrop
        className={theme.backdrop?.({}) ?? ''}
        data-oiid={oiid ? `${oiid}__backdrop` : undefined}
      />
      <Dialog.Popup
        className={theme.popup?.({ className, size, fillContainer, fitContent }) ?? className}
        data-oiid={oiid}
        data-slot="content"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
      >
        <div className="flex h-full flex-col">
          {children}
        </div>
      </Dialog.Popup>
    </Dialog.Portal>
  );
};

ModalContent.displayName = 'Modal.Content';
