/**
 * Switch component type definitions
 * @module components/switch/types
 */

import type {
  ComponentThemeConfigStructure,
  OIComponentOwnProps,
  OIDefaultProps,
} from '../../types';

/**
 * Switch variant definitions
 */
export const SwitchVariants = {
  size: ['sm', 'md', 'lg'] as const,
} as const;

/**
 * Switch modifier definitions
 */
export const SwitchModifiers = ['disabled', 'checked'] as const;

/**
 * Switch slot definitions
 */
export const SwitchSlots = ['thumb'] as const;

/**
 * Switch's own props
 */
export interface SwitchOwnProps
  extends OIComponentOwnProps<typeof SwitchVariants, typeof SwitchModifiers, typeof SwitchSlots> {
  /** Switch checked state */
  checked?: boolean;
  /** Default checked state (uncontrolled) */
  defaultChecked?: boolean;
  /** Change handler */
  onCheckedChange?: (checked: boolean) => void;
  /** Required attribute */
  required?: boolean;
  /** Name for form submission */
  name?: string;
  /** Value for form submission */
  value?: string;
  /** ID for label association */
  id?: string;
}

/**
 * Switch component props
 */
// Base UI's Switch.Root renders a span carrying role="switch", not a button, so
// the element type here follows what actually reaches the DOM.
export type SwitchProps = OIDefaultProps &
  SwitchOwnProps &
  Omit<React.HTMLAttributes<HTMLSpanElement>, keyof SwitchOwnProps | 'className'>;

/**
 * Switch component type
 */
export type SwitchComponent = React.ForwardRefExoticComponent<
  SwitchProps & { ref?: React.Ref<HTMLSpanElement> }
>;

/**
 * Default theme configuration for Switch
 */
export const switchDefaultTheme: ComponentThemeConfigStructure = {
  root: {
    base: 'peer inline-flex shrink-0 cursor-pointer items-center rounded-full border border-border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-border-focus data-[unchecked]:bg-background-muted data-[checked]:border-primary data-[checked]:bg-primary',
    variants: {
      size: {
        sm: 'h-5 w-9',
        md: 'h-6 w-11',
        lg: 'h-7 w-14',
      },
    },
    modifiers: {
      disabled: {
        true: 'cursor-not-allowed border-border opacity-100 data-[unchecked]:bg-background-muted data-[checked]:border-primary/60 data-[checked]:bg-primary/60',
        false: '',
      },
      checked: {
        true: '',
        false: '',
      },
    },
  },
  slots: {
    thumb: {
      base: 'pointer-events-none block rounded-full bg-background shadow-lg ring-0 transition-transform data-[unchecked]:translate-x-0',
      variants: {
        size: {
          sm: 'h-4 w-4 data-[checked]:translate-x-4',
          md: 'h-5 w-5 data-[checked]:translate-x-5',
          lg: 'h-6 w-6 data-[checked]:translate-x-7',
        },
      },
      modifiers: {},
    },
  },
  defaultVariants: {
    size: 'md',
  },
};
