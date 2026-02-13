/**
 * Tabs.Trigger sub-component
 * @module components/tabs
 */
import React from 'react';

import { Tabs as TabsPrimitive } from '@base-ui/react/tabs';

import { Slot } from '../../primitives/slot';
import { useTheme } from '../../theme';
import { useTabsContext } from './tabs.context';
import type { TabTriggerProps } from './tabs';
import { tabsDefaultTheme } from './tabs';

/**
 * Tabs.Trigger component
 *
 * Button that activates a tab panel.
 */
export const TabsTrigger: React.FC<TabTriggerProps> = ({
  value,
  disabled,
  start,
  end,
  children,
  className,
  oiid,
}) => {
  const theme = useTheme('tabs', tabsDefaultTheme);
  const { size, variant, fullWidth } = useTabsContext();

  return (
    <TabsPrimitive.Tab
      value={value}
      disabled={disabled}
      className={theme.trigger?.({ className, size, variant, fullWidth }) ?? className}
      data-oiid={oiid}
      data-slot="trigger"
    >
      {/* Start slot */}
      {start && (
        <Slot
          baseOiid={oiid}
          className={theme.triggerStart?.({ size }) ?? ''}
          slotName="start"
          slot={start}
          component="span"
          aria-hidden="true"
        />
      )}

      {children}

      {/* End slot */}
      {end && (
        <Slot
          baseOiid={oiid}
          className={theme.triggerEnd?.({ size }) ?? ''}
          slotName="end"
          slot={end}
          component="span"
        />
      )}
    </TabsPrimitive.Tab>
  );
};

TabsTrigger.displayName = 'Tabs.Trigger';
