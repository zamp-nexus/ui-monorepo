/**
 * Dark Theme - Primary Theme
 * Linear-inspired dark theme implementation
 *
 * Design principles:
 * - Mercury White (#F4F5F8) for highlights
 * - Nordic Gray (#222326) as base
 * - Subtle layer elevation
 * - High contrast text hierarchy
 *
 * @module tokens/themes/dark
 */

import type { ThemeContract } from './theme-contract';
import { createTheme } from './theme-contract';

/**
 * Dark theme implementing the ThemeContract
 */
export const darkTheme = createTheme({
  name: 'Open Zentra Dark',
  mode: 'dark',

  colors: {
    background: {
      // Layer system: darker = deeper
      layer00: 'hsl(228 6% 10%)', // Deepest - canvas
      layer01: 'hsl(228 6% 12%)', // Default surface
      layer02: 'hsl(228 6% 14%)', // Elevated
      layer03: 'hsl(228 6% 16%)', // Highest - modals
      overlay: 'hsla(228 6% 8% / 0.8)', // Backdrop
    },

    text: {
      // Text hierarchy: lighter = more emphasis
      highlight: 'hsl(228 15% 96%)', // Mercury White - maximum
      primary: 'hsl(228 6% 94%)', // High contrast
      secondary: 'hsl(228 6% 74%)', // Reduced
      tertiary: 'hsl(228 6% 62%)', // Placeholders
      muted: 'hsl(228 6% 40%)', // Disabled
      inverted: 'hsl(228 6% 8%)', // On colored BG
    },

    interactive: {
      primary: {
        resting: 'hsl(235 56% 60%)', // Linear accent
        hovered: 'hsl(235 56% 65%)', // Lighter on hover
        pressed: 'hsl(235 56% 55%)', // Darker on press
        disabled: 'hsl(235 20% 40%)', // Desaturated
      },
      secondary: {
        resting: 'hsl(228 6% 22%)',
        hovered: 'hsl(228 6% 24%)',
        pressed: 'hsl(228 6% 28%)',
        disabled: 'hsl(228 6% 18%)',
      },
      tertiary: {
        resting: 'transparent',
        hovered: 'hsl(228 6% 18%)',
        pressed: 'hsl(228 6% 22%)',
        disabled: 'transparent',
      },
      destructive: {
        resting: 'hsl(0 72% 52%)',
        hovered: 'hsl(0 72% 60%)',
        pressed: 'hsl(0 72% 48%)',
        disabled: 'hsl(0 30% 40%)',
      },
      smart: {
        resting: 'hsl(256 94% 63%)',
        hovered: 'hsl(256 94% 69%)',
        pressed: 'hsl(256 94% 57%)',
        disabled: 'hsl(256 40% 45%)',
      },
    },

    border: {
      default: 'hsl(228 6% 18%)',
      subtle: 'hsl(228 6% 14%)',
      emphasis: 'hsl(228 6% 24%)',
      focus: 'hsl(235 56% 60%)',
    },

    feedback: {
      success: 'hsl(142 55% 64%)',
      warning: 'hsl(45 74% 55%)',
      error: 'hsl(0 72% 60%)',
      info: 'hsl(210 80% 65%)',
    },
  },

  effects: {
    shadow: {
      depth01: '0 0 2px 0 hsla(228 6% 10% / 0.1), 0 2px 4px 0 hsla(228 6% 10% / 0.05)',
      depth02: '0 2px 12px 0 hsla(228 6% 10% / 0.12)',
      depth03: '0 0 6px 1px hsla(228 6% 10% / 0.05), 0 2px 24px 0 hsla(228 6% 10% / 0.08)',
      depth04: '0 4px 32px 0 hsla(228 6% 10% / 0.2), 0 16px 48px 0 hsla(228 6% 10% / 0.15)',
    },
    focus: {
      ring: '0 0 0 2px hsla(235 56% 60% / 0.3)',
      ringOffset: '0 0 0 4px hsla(235 56% 60% / 0.1)',
    },
  },
} as const satisfies ThemeContract);

/**
 * Export theme type for external use
 */
export type DarkTheme = typeof darkTheme;
