/**
 * Light Theme - Default product theme
 * Neutral, analytical light theme with a single indigo action color.
 *
 * Design principles:
 * - Inverted layer values (lighter = deeper)
 * - Adjusted interactive states for light backgrounds
 * - Maintained color semantics
 *
 * @module tokens/themes/light
 */

import type { ThemeContract } from './theme-contract';
import { createTheme } from './theme-contract';

/**
 * Light theme implementing the ThemeContract
 */
export const lightTheme = createTheme({
  name: 'Open Zentra Light',
  mode: 'light',

  colors: {
    background: {
      // Layer system: lighter = deeper (inverted)
      layer00: 'hsl(225 24% 98%)',
      layer01: 'hsl(0 0% 100%)',
      layer02: 'hsl(225 20% 97%)',
      layer03: 'hsl(0 0% 100%)',
      overlay: 'hsla(225 30% 12% / 0.32)',
    },

    text: {
      // Text hierarchy: darker = more emphasis
      highlight: 'hsl(228 27% 11%)',
      primary: 'hsl(228 24% 16%)',
      secondary: 'hsl(225 12% 38%)',
      tertiary: 'hsl(225 10% 50%)',
      muted: 'hsl(225 10% 64%)',
      inverted: 'hsl(0 0% 100%)',
    },

    interactive: {
      primary: {
        resting: 'hsl(238 63% 44%)',
        hovered: 'hsl(238 63% 38%)',
        pressed: 'hsl(238 63% 32%)',
        disabled: 'hsl(238 24% 72%)',
      },
      secondary: {
        resting: 'hsl(0 0% 100%)',
        hovered: 'hsl(225 20% 96%)',
        pressed: 'hsl(225 18% 93%)',
        disabled: 'hsl(225 20% 96%)',
      },
      tertiary: {
        resting: 'transparent',
        hovered: 'hsl(225 20% 96%)',
        pressed: 'hsl(225 18% 93%)',
        disabled: 'transparent',
      },
      destructive: {
        resting: 'hsl(0 74% 46%)',
        hovered: 'hsl(0 74% 42%)',
        pressed: 'hsl(0 74% 38%)',
        disabled: 'hsl(0 30% 70%)',
      },
      smart: {
        resting: 'hsl(263 83% 52%)',
        hovered: 'hsl(263 83% 46%)',
        pressed: 'hsl(263 83% 42%)',
        disabled: 'hsl(263 40% 75%)',
      },
    },

    border: {
      default: 'hsl(225 18% 89%)',
      subtle: 'hsl(225 20% 94%)',
      emphasis: 'hsl(225 16% 82%)',
      focus: 'hsl(238 63% 44%)',
    },

    feedback: {
      success: 'hsl(150 58% 31%)',
      warning: 'hsl(45 82% 38%)',
      error: 'hsl(0 74% 46%)',
      info: 'hsl(210 80% 45%)',
    },
  },

  effects: {
    shadow: {
      // Lighter shadows for light mode
      depth01: '0 1px 2px hsla(228 30% 15% / 0.04)',
      depth02: '0 6px 18px hsla(228 30% 15% / 0.06)',
      depth03: '0 12px 32px hsla(228 30% 15% / 0.08)',
      depth04: '0 20px 52px hsla(228 30% 15% / 0.12)',
    },
    focus: {
      ring: '0 0 0 2px hsla(238 63% 44% / 0.24)',
      ringOffset: '0 0 0 4px hsla(238 63% 44% / 0.1)',
    },
  },
} as const satisfies ThemeContract);

/**
 * Export theme type for external use
 */
export type LightTheme = typeof lightTheme;
