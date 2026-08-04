import type { IconName } from '@open-zentra/foundation-icons';

export interface NavItem {
  readonly label: string;
  readonly to: string;
  readonly icon: IconName;
  /** Extra path prefixes this item stays selected for. */
  readonly matches?: readonly string[];
}

/**
 * The product's destinations, in the order the rail lists them.
 *
 * Chat is the primary surface, at `/chats` (`/` redirects there) -- the
 * standalone Analysis Run launcher (create-without-a-Chat-Session) was
 * removed, and the once-standalone Analysis Run page has followed it: an
 * Analysis Run's citations, outcome and approval now render inline in the
 * Chat surface itself, so there is no deep link out of Chat to keep this
 * rail item selected for. Everything else is a Phase 2 page and currently
 * answers with a placeholder rather than a dead link.
 */
export const navItems: readonly NavItem[] = [
  { label: 'Dashboard', to: '/dashboard', icon: 'grid' },
  { label: 'Datasets', to: '/datasets', icon: 'database' },
  { label: 'Sequences', to: '/sequences', icon: 'columns' },
  { label: 'Chat', to: '/chats', icon: 'message_square' },
  { label: 'Connections', to: '/connections', icon: 'network' },
  { label: 'Settings', to: '/settings', icon: 'settings' },
];

/**
 * Whether a rail item owns the current location.
 *
 * `/` would prefix-match every path, so Chat matches exactly.
 */
export const isNavItemActive = (item: NavItem, pathname: string): boolean => {
  if (pathname === item.to) return true;
  if (item.to !== '/' && pathname.startsWith(`${item.to}/`)) return true;
  return (item.matches ?? []).some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
};
