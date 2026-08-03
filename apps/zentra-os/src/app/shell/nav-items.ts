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
 * Chat is the primary surface at `/` now (ADR-0028) -- the Investigation
 * launcher moved to an explicit `/investigations` path, reachable but no
 * longer a top-level rail destination; an Analysis Run's answer links out to
 * it directly (`AnswerRow`) instead. Everything else is a Phase 2 page and
 * currently answers with a placeholder rather than a dead link.
 */
export const navItems: readonly NavItem[] = [
  { label: 'Dashboard', to: '/dashboard', icon: 'grid' },
  { label: 'Datasets', to: '/datasets', icon: 'database' },
  { label: 'Sequences', to: '/sequences', icon: 'columns' },
  { label: 'Chat', to: '/', icon: 'message_square', matches: ['/investigations'] },
  { label: 'Connections', to: '/connections', icon: 'network' },
  { label: 'Settings', to: '/settings', icon: 'settings' },
];

/**
 * Whether a rail item owns the current location.
 *
 * `/` would prefix-match every path, so Chat matches exactly and names the
 * investigation routes it also covers (kept selected there for back-compat
 * highlighting -- a user landing directly on an Analysis Details link still
 * sees which rail item they came from).
 */
export const isNavItemActive = (item: NavItem, pathname: string): boolean => {
  if (pathname === item.to) return true;
  if (item.to !== '/' && pathname.startsWith(`${item.to}/`)) return true;
  return (item.matches ?? []).some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
};
