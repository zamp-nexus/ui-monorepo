/**
 * Light Theme - Secondary Theme
 * Linear-inspired light theme implementation
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
  name: 'Open Insights Light',
  mode: 'light',

  colors: {
    background: {
      // Layer system: lighter = deeper (inverted)
      layer00: 'hsl(228 6% 98%)', // Deepest - canvas
      layer01: 'hsl(228 6% 100%)', // Default surface (white)
      layer02: 'hsl(228 6% 100%)', // Elevated (same as layer01)
      layer03: 'hsl(228 6% 100%)', // Highest - modals
      overlay: 'hsla(228 6% 8% / 0.4)', // Backdrop (semi-transparent)
    },

    text: {
      // Text hierarchy: darker = more emphasis
      highlight: 'hsl(228 6% 8%)', // Maximum emphasis
      primary: 'hsl(228 6% 12%)', // High contrast
      secondary: 'hsl(228 6% 36%)', // Reduced
      tertiary: 'hsl(228 6% 48%)', // Placeholders
      muted: 'hsl(228 6% 62%)', // Disabled
      inverted: 'hsl(228 6% 96%)', // On colored BG
    },

    interactive: {
      primary: {
        resting: 'hsl(235 56% 56%)', // Slightly darker for light mode
        hovered: 'hsl(235 56% 50%)', // Darker on hover
        pressed: 'hsl(235 56% 45%)', // Even darker on press
        disabled: 'hsl(235 20% 70%)', // Desaturated, lighter
      },
      secondary: {
        resting: 'hsl(228 6% 100%)', // White
        hovered: 'hsl(228 6% 96%)', // Light gray
        pressed: 'hsl(228 6% 92%)', // Darker gray
        disabled: 'hsl(228 6% 96%)', // Light gray
      },
      tertiary: {
        resting: 'transparent',
        hovered: 'hsl(228 6% 96%)',
        pressed: 'hsl(228 6% 94%)',
        disabled: 'transparent',
      },
      destructive: {
        resting: 'hsl(0 72% 52%)',
        hovered: 'hsl(0 72% 48%)',
        pressed: 'hsl(0 72% 44%)',
        disabled: 'hsl(0 30% 70%)',
      },
      smart: {
        resting: 'hsl(256 94% 63%)',
        hovered: 'hsl(256 94% 57%)',
        pressed: 'hsl(256 94% 52%)',
        disabled: 'hsl(256 40% 75%)',
      },
    },

    border: {
      default: 'hsl(228 6% 92%)',
      subtle: 'hsl(228 6% 94%)',
      emphasis: 'hsl(228 6% 88%)',
      focus: 'hsl(235 56% 56%)',
    },

    feedback: {
      success: 'hsl(142 55% 47%)', // Darker for light mode
      warning: 'hsl(45 74% 47%)',
      error: 'hsl(0 72% 52%)',
      info: 'hsl(210 80% 55%)',
    },
  },

  effects: {
    shadow: {
      // Lighter shadows for light mode
      depth01: '0 0 2px 0 hsla(228 6% 8% / 0.05), 0 2px 4px 0 hsla(228 6% 8% / 0.03)',
      depth02: '0 2px 12px 0 hsla(228 6% 8% / 0.08)',
      depth03: '0 0 6px 1px hsla(228 6% 8% / 0.03), 0 2px 24px 0 hsla(228 6% 8% / 0.06)',
      depth04: '0 4px 32px 0 hsla(228 6% 8% / 0.12), 0 16px 48px 0 hsla(228 6% 8% / 0.08)',
    },
    focus: {
      ring: '0 0 0 2px hsla(235 56% 56% / 0.2)',
      ringOffset: '0 0 0 4px hsla(235 56% 56% / 0.1)',
    },
  },
} as const satisfies ThemeContract);

/**
 * Export theme type for external use
 */
export type LightTheme = typeof lightTheme;
