/**
 * Accordion component
 * @module components/accordion
 */
import { useMemo } from 'react';

import { Accordion as AccordionPrimitive } from '@base-ui/react/accordion';

import { useTheme } from '../../theme';
import type { AccordionComponent, AccordionContextValue } from './accordion';
import { accordionDefaultTheme } from './accordion';
import { AccordionContent } from './accordion-content';
import { AccordionItem } from './accordion-item';
import { AccordionTrigger } from './accordion-trigger';
import { AccordionContext } from './accordion.context';

/**
 * Accordion component
 *
 * A vertically stacked set of interactive headings that reveal content.
 *
 * @example
 * <Accordion>
 *   <Accordion.Item value="item-1">
 *     <Accordion.Trigger>Section 1</Accordion.Trigger>
 *     <Accordion.Content>Content for section 1</Accordion.Content>
 *   </Accordion.Item>
 *   <Accordion.Item value="item-2">
 *     <Accordion.Trigger>Section 2</Accordion.Trigger>
 *     <Accordion.Content>Content for section 2</Accordion.Content>
 *   </Accordion.Item>
 * </Accordion>
 */
const AccordionRoot: AccordionComponent = ({
  oiid,
  variant = 'default',
  multiple = false,
  value,
  defaultValue,
  onValueChange,
  disabled,
  children,
}) => {
  const theme = useTheme('accordion', accordionDefaultTheme);

  // Context value for sub-components
  const contextValue: AccordionContextValue = useMemo(
    () => ({
      variant,
      disabled,
    }),
    [variant, disabled],
  );

  return (
    <AccordionContext.Provider value={contextValue}>
      <AccordionPrimitive.Root
        value={value}
        defaultValue={defaultValue}
        onValueChange={onValueChange}
        className={theme.root?.({ variant, disabled }) ?? ''}
        data-oiid={oiid}
      >
        {children}
      </AccordionPrimitive.Root>
    </AccordionContext.Provider>
  );
};

// Attach sub-components
AccordionRoot.displayName = 'Accordion';
AccordionRoot.Item = AccordionItem;
AccordionRoot.Trigger = AccordionTrigger;
AccordionRoot.Content = AccordionContent;

export const Accordion = AccordionRoot;
