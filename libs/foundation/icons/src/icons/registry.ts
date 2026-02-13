import type { LucideIcon } from 'lucide-react';
import type { RegisterIconOptions } from '../icon';

/**
 * Registry of available icons.
 *
 * Maps icon names to their lucide-react components for string-based lookup
 * via the `<Icon name="..." />` component.
 *
 * Note: lucide-react is tree-shakeable. The bundled cost is determined by
 * which icons are registered here, not by the lucide-react package itself.
 */
const iconRegistry = new Map<string, LucideIcon>();

/**
 * All registered icon name literals.
 *
 * Keep this list in sync with the `registerIcon` calls in `./index.ts`.
 * The `IconName` union type is derived from this array so that consumers
 * get autocomplete and compile-time safety.
 */
export const ICON_NAMES = [
  // Navigation
  'home', 'menu', 'chevron-left', 'chevron-right', 'chevron-up', 'chevron-down',
  'arrow-left', 'arrow-right', 'arrow-up', 'arrow-down',
  'navigation', 'navigation-2', 'compass',
  // Actions
  'search', 'plus', 'minus', 'edit', 'edit-2', 'edit-3',
  'trash', 'trash-2', 'save', 'x', 'check', 'copy', 'scissors',
  'clipboard', 'clipboard-copy', 'download', 'upload',
  'share', 'share-2', 'send', 'mail', 'message-square',
  'phone', 'video', 'camera', 'image', 'file', 'file-text',
  'folder', 'folder-open', 'settings', 'more-vertical', 'more-horizontal',
  'filter', 'sort-asc', 'sort-desc',
  // Status
  'alert-circle', 'alert-triangle', 'info', 'check-circle', 'x-circle',
  'help-circle', 'loader-2', 'clock', 'calendar', 'bell', 'bell-off',
  'star', 'heart', 'thumbs-up', 'thumbs-down',
  // UI
  'user', 'users', 'user-plus', 'user-minus',
  'lock', 'unlock', 'eye', 'eye-off', 'shield', 'key',
  'log-in', 'log-out', 'cog', 'wrench', 'grid', 'list',
  'layout', 'sidebar', 'panel-left', 'columns', 'rows',
  // Additional common
  'refresh-cw', 'rotate-cw', 'rotate-ccw', 'zoom-in', 'zoom-out',
  'maximize', 'minimize', 'external-link', 'link', 'bookmark',
  'tag', 'tags', 'shopping-cart', 'credit-card', 'package', 'box',
  'archive', 'inbox',
] as const;

/**
 * Union type of all available icon names.
 *
 * Provides compile-time autocomplete and safety when referencing icons
 * by name. Accepts any string in `ICON_NAMES` plus arbitrary strings
 * registered at runtime via `registerIcon`.
 */
export type IconName = (typeof ICON_NAMES)[number] | (string & {});

/**
 * Register a new icon in the registry
 *
 * @param options - Options for registering the icon
 * @throws Error if icon name already exists
 *
 * @example
 * ```ts
 * import { Home } from 'lucide-react';
 * registerIcon({ name: 'home', component: Home });
 * ```
 */
export function registerIcon(options: RegisterIconOptions): void {
  const { name, component } = options;

  if (iconRegistry.has(name)) {
    throw new Error(`Icon "${name}" is already registered`);
  }

  iconRegistry.set(name, component as LucideIcon);
}

/**
 * Get an icon component from the registry by name
 *
 * @param name - Name of the icon to retrieve
 * @returns The icon component or undefined if not found
 */
export function getIcon(name: IconName): LucideIcon | undefined {
  return iconRegistry.get(name);
}

/**
 * Check if an icon is registered
 *
 * @param name - Name of the icon to check
 * @returns True if the icon is registered, false otherwise
 */
export function hasIcon(name: IconName): boolean {
  return iconRegistry.has(name);
}

/**
 * Get all registered icon names
 *
 * @returns Array of all registered icon names
 */
export function getAllIconNames(): IconName[] {
  return Array.from(iconRegistry.keys());
}

/**
 * Clear all registered icons (useful for testing)
 */
export function clearRegistry(): void {
  iconRegistry.clear();
}
