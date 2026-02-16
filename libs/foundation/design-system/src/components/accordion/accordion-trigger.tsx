/**
 * Accordion.Trigger sub-component
 * @module components/accordion
 */
import React from 'react';

import { Accordion as AccordionPrimitive } from '@base-ui/react/accordion';

import { Icon } from '@open-insights-web/foundation-icons';

import { Slot } from '../../primitives/slot';
import { useTheme } from '../../theme';
import { useAccordionContext } from './accordion.context';
import type { AccordionTriggerProps } from './types';
import { accordionDefaultTheme } from './types';

/**
 * Accordion.Trigger component
 *
 * Button that toggles the accordion item.
 */
export const AccordionTrigger: React.FC<AccordionTriggerProps> = ({
  icon,
  children,
  className,
  oiid,
}) => {
  const theme = useTheme('accordion', accordionDefaultTheme);
  const { disabled } = useAccordionContext();

  return (
    <AccordionPrimitive.Header>
      <AccordionPrimitive.Trigger
        className={theme.trigger?.({ className, disabled }) ?? className}
        data-oiid={oiid}
        data-slot="trigger"
      >
        {children}
        <Slot
          baseOiid={oiid}
          className={theme.icon?.({}) ?? ''}
          slotName="icon"
          slot={icon}
          component="span"
          aria-hidden="true"
        >
          <Icon name="chevron-down" size="sm" />
        </Slot>
      </AccordionPrimitive.Trigger>
    </AccordionPrimitive.Header>
  );
};

AccordionTrigger.displayName = 'Accordion.Trigger';
