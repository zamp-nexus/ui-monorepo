/**
 * Dark Theme - Primary Theme
 *
 * Design principles:
 * - Slate-charcoal canvas
 * - Indigo as the single interactive accent
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
      layer00: 'hsl(228 18% 8%)',
      layer01: 'hsl(228 16% 10%)',
      layer02: 'hsl(228 14% 13%)',
      layer03: 'hsl(228 13% 16%)',
      overlay: 'hsla(228 26% 3% / 0.66)',
    },

    text: {
      // Text hierarchy: lighter = more emphasis
      highlight: 'hsl(225 18% 96%)',
      primary: 'hsl(225 14% 91%)',
      secondary: 'hsl(225 10% 72%)',
      tertiary: 'hsl(225 8% 60%)',
      muted: 'hsl(225 7% 46%)',
      inverted: 'hsl(228 18% 10%)',
    },

    interactive: {
      primary: {
        resting: 'hsl(238 86% 72%)',
        hovered: 'hsl(238 90% 78%)',
        pressed: 'hsl(238 78% 65%)',
        disabled: 'hsl(238 20% 34%)',
      },
      secondary: {
        resting: 'hsl(140 6% 14%)',
        hovered: 'hsl(140 6% 18%)',
        pressed: 'hsl(140 6% 22%)',
        disabled: 'hsl(140 6% 12%)',
      },
      tertiary: {
        resting: 'transparent',
        hovered: 'hsl(140 6% 12%)',
        pressed: 'hsl(140 6% 16%)',
        disabled: 'transparent',
      },
      destructive: {
        resting: 'hsl(0 74% 54%)',
        hovered: 'hsl(0 78% 62%)',
        pressed: 'hsl(0 74% 48%)',
        disabled: 'hsl(0 30% 40%)',
      },
      smart: {
        resting: 'hsl(238 86% 72%)',
        hovered: 'hsl(238 90% 78%)',
        pressed: 'hsl(238 78% 65%)',
        disabled: 'hsl(238 20% 34%)',
      },
    },

    border: {
      default: 'hsl(228 12% 20%)',
      subtle: 'hsl(228 12% 16%)',
      emphasis: 'hsl(228 12% 28%)',
      focus: 'hsl(238 86% 72%)',
    },

    feedback: {
      success: 'hsl(92 72% 60%)',
      warning: 'hsl(45 90% 60%)',
      error: 'hsl(0 78% 63%)',
      info: 'hsl(210 80% 65%)',
    },
  },

  effects: {
    shadow: {
      depth01: '0 1px 2px hsla(228 30% 2% / 0.22)',
      depth02: '0 8px 24px hsla(228 30% 2% / 0.28)',
      depth03: '0 16px 40px hsla(228 30% 2% / 0.36)',
      depth04: '0 24px 64px hsla(228 30% 2% / 0.44)',
    },
    focus: {
      ring: '0 0 0 3px hsla(238 86% 72% / 0.22)',
      ringOffset: 'none',
    },
  },
} as const satisfies ThemeContract);

/**
 * Export theme type for external use
 */
export type DarkTheme = typeof darkTheme;
