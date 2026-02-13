/**
 * Accordion.Content sub-component
 * @module components/accordion
 */
import React from 'react';

import { Accordion as AccordionPrimitive } from '@base-ui/react/accordion';

import { useTheme } from '../../theme';
import type { AccordionContentProps } from './accordion';
import { accordionDefaultTheme } from './accordion';

/**
 * Accordion.Content component
 *
 * Container for the accordion item content.
 */
export const AccordionContent: React.FC<AccordionContentProps> = ({
  children,
  className,
  oiid,
}) => {
  const theme = useTheme('accordion', accordionDefaultTheme);

  return (
    <AccordionPrimitive.Panel
      className={theme.content?.({ className }) ?? className}
      data-oiid={oiid}
      data-slot="content"
    >
      <div className={theme.contentInner?.({}) ?? ''}>
        {children}
      </div>
    </AccordionPrimitive.Panel>
  );
};

AccordionContent.displayName = 'Accordion.Content';
