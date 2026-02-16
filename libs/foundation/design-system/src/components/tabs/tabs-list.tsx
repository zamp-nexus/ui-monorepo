/**
 * Tabs.List sub-component
 * @module components/tabs
 */
import React from 'react';

import { Tabs as TabsPrimitive } from '@base-ui/react/tabs';

import { useTheme } from '../../theme';
import type { TabsListProps } from './tabs';
import { tabsDefaultTheme } from './tabs';
import { useTabsContext } from './tabs.context';

/**
 * Tabs.List component
 *
 * Container for tab triggers.
 */
export const TabsList: React.FC<TabsListProps> = ({ children, className, oiid }) => {
  const theme = useTheme('tabs', tabsDefaultTheme);
  const { variant, fullWidth } = useTabsContext();

  return (
    <TabsPrimitive.List
      className={theme.list?.({ className, variant, fullWidth }) ?? className}
      data-oiid={oiid}
      data-slot="list"
    >
      {children}
    </TabsPrimitive.List>
  );
};

TabsList.displayName = 'Tabs.List';
