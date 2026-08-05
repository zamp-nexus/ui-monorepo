import { afterEach, describe, expect, it, vi } from 'vitest';

import { applyThemeToDocument, readThemePreference, resolveTheme } from './theme-mode';

describe('theme mode', () => {
  afterEach(() => {
    localStorage.clear();
    delete document.documentElement.dataset.theme;
    document.documentElement.style.colorScheme = '';
    vi.unstubAllGlobals();
  });

  it('uses the persisted preference only when it is valid', () => {
    localStorage.setItem('nexus.theme-preference', 'dark');
    expect(readThemePreference()).toBe('dark');
    localStorage.setItem('nexus.theme-preference', 'violet');
    expect(readThemePreference()).toBe('system');
  });

  it('applies the single resolved mode to the document', () => {
    expect(applyThemeToDocument('dark')).toBe('dark');
    expect(document.documentElement.dataset.theme).toBe('dark');
    expect(document.documentElement.style.colorScheme).toBe('dark');
  });

  it('resolves system preference through the operating-system media query', () => {
    vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: true })));
    expect(resolveTheme('system')).toBe('dark');
  });
});
