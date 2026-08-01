/**
 * SideNav component type definitions
 * @module components/side-nav/types
 */

import type {
  ComponentThemeConfigStructure,
  OIComponentOwnProps,
  OIComponentSlotProps,
  OIDefaultProps,
  PolymorphicProps,
  PolymorphicRef,
} from '../../types';

/**
 * SideNav variant definitions
 */
export const SideNavVariants = {
  width: ['compact', 'default'] as const,
} as const;

/**
 * SideNav modifier definitions
 */
export const SideNavModifiers = [] as const;

/**
 * SideNav slot definitions
 */
export const SideNavSlots = ['brand', 'footer'] as const;

/**
 * SideNav's own props
 */
export interface SideNavOwnProps
  extends OIComponentOwnProps<
    typeof SideNavVariants,
    typeof SideNavModifiers,
    typeof SideNavSlots
  > {
  /** Rail width */
  width?: (typeof SideNavVariants.width)[number];
  /** Product mark or workspace switcher, pinned to the top of the rail */
  brand?: OIComponentSlotProps;
  /** Content pinned to the bottom of the rail */
  footer?: OIComponentSlotProps;
  /** Navigation items */
  children?: React.ReactNode;
}

/**
 * SideNav component props
 */
export type SideNavProps<T extends React.ElementType = 'nav'> = PolymorphicProps<
  T,
  SideNavOwnProps
>;

/**
 * SideNav component ref type
 */
export type SideNavRef<T extends React.ElementType = 'nav'> = PolymorphicRef<T>;

/**
 * SideNav.Item's own props
 */
export interface SideNavItemOwnProps extends OIDefaultProps {
  /** Leading icon */
  icon?: OIComponentSlotProps;
  /** Marks the destination the user is currently on */
  active?: boolean;
  /** Label */
  children?: React.ReactNode;
}

/**
 * SideNav.Item props
 *
 * Polymorphic so a router link can be supplied: `component={Link} to="/chat"`.
 */
export type SideNavItemProps<T extends React.ElementType = 'a'> = PolymorphicProps<
  T,
  SideNavItemOwnProps
>;

export interface SideNavItemComponent {
  <T extends React.ElementType = 'a'>(
    props: SideNavItemProps<T> & { ref?: PolymorphicRef<T> },
  ): React.ReactNode;
  displayName?: string;
}

/**
 * SideNav component type with sub-components
 */
export interface SideNavComponent {
  <T extends React.ElementType = 'nav'>(
    props: SideNavProps<T> & { ref?: SideNavRef<T> },
  ): React.ReactNode;
  displayName?: string;
  Item: SideNavItemComponent;
}

/**
 * Default theme configuration for SideNav
 */
export const sideNavDefaultTheme: ComponentThemeConfigStructure = {
  root: {
    base: 'flex h-full shrink-0 flex-col gap-6 border-r border-border bg-card px-3 py-5',
    variants: {
      width: {
        compact: 'w-16 items-center',
        default: 'w-60',
      },
    },
    modifiers: {},
  },
  slots: {
    brand: {
      base: 'px-2',
      variants: {},
      modifiers: {},
    },
    list: {
      base: 'flex flex-1 flex-col gap-1',
      variants: {},
      modifiers: {},
    },
    footer: {
      base: 'mt-auto flex flex-col gap-2',
      variants: {},
      modifiers: {},
    },
    item: {
      base: 'flex items-center gap-3 rounded-sm px-3 py-2 text-sm no-underline transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus',
      variants: {},
      modifiers: {
        active: {
          true: 'bg-accent text-accent-foreground font-medium',
          false: 'text-foreground-muted hover:bg-secondary hover:text-foreground',
        },
      },
    },
    itemIcon: {
      base: 'shrink-0 [&>svg]:h-4 [&>svg]:w-4',
      variants: {},
      modifiers: {},
    },
  },
  defaultVariants: {
    width: 'default',
  },
};
