/**
 * Menu component
 * @module components/menu
 */
import { useMemo } from 'react';
import * as React from 'react';

import { Menu as MenuPrimitive } from '@base-ui/react/menu';

import { Icon } from '@open-insights-web/foundation-icons';

import { Slot } from '../../primitives/slot';
import { useTheme } from '../../theme';
import { Checkbox } from '../checkbox';
import type {
  MenuCheckboxItemProps,
  MenuComponent,
  MenuContentProps,
  MenuContextValue,
  MenuGroupLabelProps,
  MenuGroupProps,
  MenuItemProps,
  MenuRadioGroupProps,
  MenuRadioItemProps,
  MenuSeparatorProps,
  MenuSubContentProps,
  MenuSubProps,
  MenuSubTriggerProps,
  MenuTriggerProps,
} from './menu';
import { menuDefaultTheme } from './menu';
import { MenuContext } from './menu.context';

// ============================================================================
// Menu Root
// ============================================================================

const MenuRoot: MenuComponent = ({
  size = 'md',
  open,
  defaultOpen,
  onOpenChange,
  onClear,
  children,
}) => {
  const contextValue: MenuContextValue = useMemo(
    () => ({
      size,
      onClear,
    }),
    [size, onClear],
  );

  return (
    <MenuContext.Provider value={contextValue}>
      <MenuPrimitive.Root open={open} defaultOpen={defaultOpen} onOpenChange={onOpenChange}>
        {children}
      </MenuPrimitive.Root>
    </MenuContext.Provider>
  );
};

// ============================================================================
// Menu Trigger
// ============================================================================

const MenuTrigger: React.FC<MenuTriggerProps> = ({ children, disabled, oiid }) => (
  <MenuPrimitive.Trigger disabled={disabled} data-oiid={oiid} data-slot="trigger">
    {children}
  </MenuPrimitive.Trigger>
);
MenuTrigger.displayName = 'Menu.Trigger';

// ============================================================================
// Menu Content
// ============================================================================

const MenuContent: React.FC<MenuContentProps> = ({
  children,
  sideOffset = 4,
  alignOffset,
  side = 'bottom',
  align = 'start',
  oiid,
}) => {
  const theme = useTheme('menu', menuDefaultTheme);

  return (
    <MenuPrimitive.Portal>
      <MenuPrimitive.Positioner
        sideOffset={sideOffset}
        alignOffset={alignOffset}
        side={side}
        align={align}
        className={theme.positioner?.({}) ?? ''}
      >
        <MenuPrimitive.Popup
          className={theme.popup?.({}) ?? ''}
          data-oiid={oiid}
          data-slot="content"
        >
          {children}
        </MenuPrimitive.Popup>
      </MenuPrimitive.Positioner>
    </MenuPrimitive.Portal>
  );
};
MenuContent.displayName = 'Menu.Content';

// ============================================================================
// Menu Item
// ============================================================================

const MenuItem: React.FC<MenuItemProps> = ({
  children,
  disabled,
  onSelect,
  closeOnSelect = true,
  start,
  end,
  oiid,
}) => {
  const theme = useTheme('menu', menuDefaultTheme);
  const { size } = useMenuContext();

  return (
    <MenuPrimitive.Item
      disabled={disabled}
      closeOnClick={closeOnSelect}
      onClick={onSelect}
      className={theme.item?.({ size }) ?? ''}
      data-oiid={oiid}
      data-slot="item"
    >
      {start && (
        <Slot
          baseOiid={oiid}
          className={theme.itemStart?.({ size }) ?? ''}
          slotName="start"
          slot={start}
          component="span"
          aria-hidden="true"
        />
      )}
      {children}
      {end && (
        <Slot
          baseOiid={oiid}
          className={theme.itemEnd?.({}) ?? ''}
          slotName="end"
          slot={end}
          component="span"
        />
      )}
    </MenuPrimitive.Item>
  );
};
MenuItem.displayName = 'Menu.Item';

// ============================================================================
// Menu Checkbox Item
// ============================================================================

const MenuCheckboxItem: React.FC<MenuCheckboxItemProps> = ({
  children,
  checked,
  onCheckedChange,
  disabled,
  closeOnSelect = false,
  oiid,
}) => {
  const theme = useTheme('menu', menuDefaultTheme);
  const { size } = useMenuContext();

  const handleClick = () => {
    onCheckedChange?.(!checked);
  };

  return (
    <MenuPrimitive.Item
      disabled={disabled}
      closeOnClick={closeOnSelect}
      onClick={handleClick}
      className={theme.checkboxItem?.({ size }) ?? ''}
      data-oiid={oiid}
      data-slot="checkboxItem"
      data-checked={checked || undefined}
    >
      <span className={theme.checkboxIndicator?.({ size }) ?? ''}>
        <Checkbox
          checked={checked}
          disabled={disabled}
          size={size === 'lg' ? 'lg' : size === 'sm' ? 'sm' : 'md'}
          tabIndex={-1}
        />
      </span>
      {children}
    </MenuPrimitive.Item>
  );
};
MenuCheckboxItem.displayName = 'Menu.CheckboxItem';

// ============================================================================
// Menu Radio Group
// ============================================================================

const MenuRadioGroupContext = React.createContext<{
  value?: string;
  onValueChange?: (value: string) => void;
} | null>(null);

const MenuRadioGroup: React.FC<MenuRadioGroupProps> = ({
  children,
  value,
  onValueChange,
  oiid,
}) => {
  const contextValue = useMemo(() => ({ value, onValueChange }), [value, onValueChange]);

  return (
    <MenuRadioGroupContext.Provider value={contextValue}>
      <MenuPrimitive.RadioGroup
        value={value}
        onValueChange={onValueChange}
        data-oiid={oiid}
        data-slot="radioGroup"
      >
        {children}
      </MenuPrimitive.RadioGroup>
    </MenuRadioGroupContext.Provider>
  );
};
MenuRadioGroup.displayName = 'Menu.RadioGroup';

// ============================================================================
// Menu Radio Item
// ============================================================================

const MenuRadioItem: React.FC<MenuRadioItemProps> = ({
  children,
  value,
  disabled,
  closeOnSelect = false,
  oiid,
}) => {
  const theme = useTheme('menu', menuDefaultTheme);
  const { size } = useMenuContext();
  const radioContext = React.useContext(MenuRadioGroupContext);
  const isChecked = radioContext?.value === value;

  return (
    <MenuPrimitive.RadioItem
      value={value}
      disabled={disabled}
      closeOnClick={closeOnSelect}
      className={theme.radioItem?.({ size }) ?? ''}
      data-oiid={oiid}
      data-slot="radioItem"
      data-checked={isChecked || undefined}
    >
      <span className={theme.radioIndicator?.({ size }) ?? ''}>
        {isChecked && <span className="h-2 w-2 rounded-full bg-current" />}
      </span>
      {children}
    </MenuPrimitive.RadioItem>
  );
};
MenuRadioItem.displayName = 'Menu.RadioItem';

// ============================================================================
// Menu Group
// ============================================================================

const MenuGroup: React.FC<MenuGroupProps> = ({ children, oiid }) => {
  const theme = useTheme('menu', menuDefaultTheme);

  return (
    <MenuPrimitive.Group className={theme.group?.({}) ?? ''} data-oiid={oiid} data-slot="group">
      {children}
    </MenuPrimitive.Group>
  );
};
MenuGroup.displayName = 'Menu.Group';

// ============================================================================
// Menu Group Label
// ============================================================================

const MenuGroupLabel: React.FC<MenuGroupLabelProps> = ({ children, oiid }) => {
  const theme = useTheme('menu', menuDefaultTheme);

  return (
    <MenuPrimitive.GroupLabel
      className={theme.groupLabel?.({}) ?? ''}
      data-oiid={oiid}
      data-slot="groupLabel"
    >
      {children}
    </MenuPrimitive.GroupLabel>
  );
};
MenuGroupLabel.displayName = 'Menu.GroupLabel';

// ============================================================================
// Menu Separator
// ============================================================================

const MenuSeparator: React.FC<MenuSeparatorProps> = ({ oiid }) => {
  const theme = useTheme('menu', menuDefaultTheme);

  return (
    <MenuPrimitive.Separator
      className={theme.separator?.({}) ?? ''}
      data-oiid={oiid}
      data-slot="separator"
    />
  );
};
MenuSeparator.displayName = 'Menu.Separator';

// ============================================================================
// Menu Sub
// ============================================================================

const MenuSub: React.FC<MenuSubProps> = ({ children, open, defaultOpen, onOpenChange, oiid }) => {
  return (
    <MenuPrimitive.Root open={open} defaultOpen={defaultOpen} onOpenChange={onOpenChange}>
      {children}
    </MenuPrimitive.Root>
  );
};
MenuSub.displayName = 'Menu.Sub';

// ============================================================================
// Menu Sub Trigger
// ============================================================================

const MenuSubTrigger: React.FC<MenuSubTriggerProps> = ({ children, disabled, start, oiid }) => {
  const theme = useTheme('menu', menuDefaultTheme);
  const { size } = useMenuContext();

  return (
    <MenuPrimitive.SubmenuTrigger
      disabled={disabled}
      className={theme.subTrigger?.({ size }) ?? ''}
      data-oiid={oiid}
      data-slot="subTrigger"
    >
      {start && (
        <Slot
          baseOiid={oiid}
          className={theme.itemStart?.({ size }) ?? ''}
          slotName="start"
          slot={start}
          component="span"
          aria-hidden="true"
        />
      )}
      {children}
      <Icon name="chevron-right" className={theme.subTriggerIcon?.({ size }) ?? ''} />
    </MenuPrimitive.SubmenuTrigger>
  );
};
MenuSubTrigger.displayName = 'Menu.SubTrigger';

// ============================================================================
// Menu Sub Content
// ============================================================================

const MenuSubContent: React.FC<MenuSubContentProps> = ({ children, oiid }) => {
  const theme = useTheme('menu', menuDefaultTheme);

  return (
    <MenuPrimitive.Portal>
      <MenuPrimitive.Positioner sideOffset={2} className={theme.positioner?.({}) ?? ''}>
        <MenuPrimitive.Popup
          className={theme.subContent?.({}) ?? ''}
          data-oiid={oiid}
          data-slot="subContent"
        >
          {children}
        </MenuPrimitive.Popup>
      </MenuPrimitive.Positioner>
    </MenuPrimitive.Portal>
  );
};
MenuSubContent.displayName = 'Menu.SubContent';

// ============================================================================
// Helper hook for context
// ============================================================================

function useMenuContext() {
  const context = React.useContext(MenuContext);
  if (!context) {
    return { size: 'md' as const };
  }
  return context;
}

// ============================================================================
// Attach sub-components
// ============================================================================

MenuRoot.displayName = 'Menu';
MenuRoot.Trigger = MenuTrigger;
MenuRoot.Content = MenuContent;
MenuRoot.Item = MenuItem;
MenuRoot.CheckboxItem = MenuCheckboxItem;
MenuRoot.RadioGroup = MenuRadioGroup;
MenuRoot.RadioItem = MenuRadioItem;
MenuRoot.Group = MenuGroup;
MenuRoot.GroupLabel = MenuGroupLabel;
MenuRoot.Separator = MenuSeparator;
MenuRoot.Sub = MenuSub;
MenuRoot.SubTrigger = MenuSubTrigger;
MenuRoot.SubContent = MenuSubContent;

export const Menu = MenuRoot;
