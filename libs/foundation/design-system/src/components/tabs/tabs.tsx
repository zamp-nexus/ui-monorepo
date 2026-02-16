/**
 * Tabs component
 * @module components/tabs
 */
import { useMemo } from 'react';

import { Tabs as TabsPrimitive } from '@base-ui/react/tabs';

import { useTheme } from '../../theme';
import type { TabsComponent, TabsContextValue } from './tabs';
import { tabsDefaultTheme } from './tabs';
import { TabsContent } from './tabs-content';
import { TabsList } from './tabs-list';
import { TabsTrigger } from './tabs-trigger';
import { TabsContext } from './tabs.context';

/**
 * Tabs component
 *
 * A set of layered sections of content shown one at a time.
 *
 * @example
 * <Tabs defaultValue="tab1">
 *   <Tabs.List>
 *     <Tabs.Trigger value="tab1">Tab 1</Tabs.Trigger>
 *     <Tabs.Trigger value="tab2">Tab 2</Tabs.Trigger>
 *   </Tabs.List>
 *   <Tabs.Content value="tab1">Content 1</Tabs.Content>
 *   <Tabs.Content value="tab2">Content 2</Tabs.Content>
 * </Tabs>
 */
const TabsRoot: TabsComponent = ({
  oiid,
  size = 'md',
  variant = 'default',
  fullWidth,
  value,
  defaultValue,
  onValueChange,
  children,
}) => {
  const theme = useTheme('tabs', tabsDefaultTheme);

  // Context value for sub-components
  const contextValue: TabsContextValue = useMemo(
    () => ({
      size,
      variant,
      fullWidth,
    }),
    [size, variant, fullWidth],
  );

  return (
    <TabsContext.Provider value={contextValue}>
      <TabsPrimitive.Root
        value={value}
        defaultValue={defaultValue}
        onValueChange={(newValue) => {
          if (typeof newValue === 'string') {
            onValueChange?.(newValue);
          }
        }}
        className={theme.root?.({ size, variant, fullWidth }) ?? ''}
        data-oiid={oiid}
      >
        {children}
      </TabsPrimitive.Root>
    </TabsContext.Provider>
  );
};

// Attach sub-components
TabsRoot.displayName = 'Tabs';
TabsRoot.List = TabsList;
TabsRoot.Trigger = TabsTrigger;
TabsRoot.Content = TabsContent;

export const Tabs = TabsRoot;
