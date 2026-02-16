/**
 * Toast component
 * @module components/toast
 */
import React from 'react';

import { Icon } from '@open-insights-web/foundation-icons';

import { Slot } from '../../primitives/slot';
import { useTheme } from '../../theme';
import { ToastActions } from './toast-actions';
import { ToastBody } from './toast-body';
import { ToastDescription } from './toast-description';
import { ToastTitle } from './toast-title';
import type { ToastComponent, ToastProps } from './types';
import { toastDefaultTheme } from './types';

/**
 * Default feedback icons
 */
const FeedbackIcons = {
  info: () => <Icon name="info" />,
  success: () => <Icon name="check-circle" />,
  warning: () => <Icon name="alert-triangle" />,
  error: () => <Icon name="alert-circle" />,
};

/**
 * Default close icon
 */
const CloseIcon = () => <Icon name="x" size="sm" />;

/**
 * Toast component
 *
 * A notification toast with support for different feedback states,
 * icons, and action buttons.
 *
 * @example
 * <Toast feedback="success" closable onClose={handleClose}>
 *   <Toast.Title>Success!</Toast.Title>
 *   <Toast.Description>
 *     Your changes have been saved successfully.
 *   </Toast.Description>
 * </Toast>
 *
 * @example
 * <Toast feedback="error" closable>
 *   <Toast.Title>Error</Toast.Title>
 *   <Toast.Description>
 *     Something went wrong. Please try again.
 *   </Toast.Description>
 *   <Toast.Actions>
 *     <Button size="sm">Retry</Button>
 *   </Toast.Actions>
 * </Toast>
 */
const ToastRoot = React.forwardRef(function Toast<T extends React.ElementType = 'div'>(
  {
    component,
    className,
    children,
    oiid,
    feedback = 'info',
    closable,
    start,
    end,
    close,
    onClose,
    ...rest
  }: ToastProps<T>,
  ref: React.ForwardedRef<Element>,
) {
  const theme = useTheme('toast', toastDefaultTheme);
  const Element = component ?? 'div';

  // Default start icon based on feedback type
  const DefaultIcon = FeedbackIcons[feedback];
  const showDefaultIcon = !start && DefaultIcon;

  return (
    <Element
      ref={ref}
      className={theme.root({ className, feedback, closable })}
      data-oiid={oiid}
      data-feedback={feedback}
      role="alert"
      aria-live="assertive"
      aria-atomic="true"
      {...rest}
    >
      {/* Start slot (icon) */}
      {(start || showDefaultIcon) && (
        <Slot
          baseOiid={oiid}
          className={theme.start?.({ feedback }) ?? ''}
          slotName="start"
          slot={start}
          component="span"
          aria-hidden="true"
        >
          {showDefaultIcon && <DefaultIcon />}
        </Slot>
      )}

      {/* Main content */}
      <div className={theme.content?.({}) ?? 'flex-1 min-w-0'}>{children}</div>

      {/* End slot */}
      {end && (
        <Slot
          baseOiid={oiid}
          className={theme.end?.({}) ?? ''}
          slotName="end"
          slot={end}
          component="span"
        />
      )}

      {/* Close button */}
      {closable && (
        <Slot
          baseOiid={oiid}
          className={theme.close?.({ feedback }) ?? ''}
          slotName="close"
          slot={close}
          component="button"
          onClick={onClose}
          aria-label="Close notification"
          type="button"
        >
          <CloseIcon />
        </Slot>
      )}
    </Element>
  );
}) as unknown as ToastComponent;

// Attach sub-components
ToastRoot.displayName = 'Toast';
ToastRoot.Title = ToastTitle;
ToastRoot.Description = ToastDescription;
ToastRoot.Body = ToastBody;
ToastRoot.Actions = ToastActions;

export const Toast = ToastRoot;
