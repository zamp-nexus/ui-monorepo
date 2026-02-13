/* eslint-disable sort-keys-fix/sort-keys-fix */
export type IconSizeType =
  | '4xs'
  | '3xs'
  | '2xs'
  | 'xs'
  | 'sm'
  | 'base'
  | 'lg'
  | 'xl'
  | '2xl'
  | '3xl'
  | '4xl'
  | '5xl'
  | '9xl'
  | '12xl'
  | '16xl'
  | '24xl'
  | 'full';

/**
 * Mapping of commonly used dimensions to Tailwind width/height scale
 *
 * @link https://tailwindcss.com/docs/customizing-spacing#default-spacing-scale
 */
export const ICON_SIZE_MAPPER: {
  [key in IconSizeType]: string;
} = {
  // Pixel sizes below are relative to a 16px base
  '4xs': 'h-1 w-1',
  '3xs': 'h-2 w-2', // 8x8px
  '2xs': 'h-2.5 w-2.5', // 10x10px
  xs: 'h-3 w-3', // 12x12px
  sm: 'h-3.5 w-3.5', // 14x14px
  base: 'h-4 w-4', // 16x16px
  lg: 'h-5 w-5', // 20x20px
  // TODO: Add 4.5
  xl: 'h-6 w-6', // 24x24px
  '2xl': 'h-8 w-8', // 32x32px
  '3xl': 'h-9 w-9', // 36x36px
  '4xl': 'h-10 w-10', // 40x40px
  '5xl': 'h-12 w-12', // 48x48px
  '9xl': 'h-16 w-16', // 64x64px
  '12xl': 'h-24 w-24', // 96x96px
  '16xl': 'h-44 w-44', // 176x176px
  '24xl': 'h-56 w-56', // 224x224px
  full: 'h-full w-full',
};
