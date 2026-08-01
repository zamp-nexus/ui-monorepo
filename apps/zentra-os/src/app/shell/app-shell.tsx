import type { ReactNode } from 'react';

import { useAuth } from '@open-zentra/foundation-auth';
import { Avatar, Button, SideNav } from '@open-zentra/foundation-design-system';
import { Icon } from '@open-zentra/foundation-icons';
import { Link, useLocation } from 'react-router-dom';

import type { IdentityContext, ReadinessResponse } from '../types';
import { isNavItemActive, navItems } from './nav-items';
import { ProductMark } from './product-mark';

interface AppShellProps {
  readonly children: ReactNode;
  readonly identity: IdentityContext;
  readonly readiness: ReadinessResponse | undefined;
}

/**
 * Which tenant this is and whether its dependencies answered.
 *
 * It sits in the rail rather than in a bar across every page: it is context for
 * the whole session, not a heading for the page being read.
 */
const WorkspaceLockup = ({
  identity,
  readiness,
}: {
  readonly identity: IdentityContext;
  readonly readiness: ReadinessResponse | undefined;
}) => {
  const ready = readiness?.status === 'ready';
  return (
    <div className="mt-4 flex flex-col gap-1 font-mono text-[10px] uppercase tracking-[0.14em] text-foreground-muted">
      <span className="flex items-center gap-2 text-foreground">
        <i
          className={`h-1.5 w-1.5 shrink-0 rounded-full ${ready ? 'bg-primary' : 'bg-warning'}`}
          aria-hidden="true"
        />
        <span className="truncate">{identity.tenant_name}</span>
      </span>
      <span>
        {identity.role} · {ready ? 'foundation ready' : 'dependency review'}
      </span>
    </div>
  );
};

/**
 * The frame every authenticated page renders inside: the navigation rail, and
 * the page itself. Nothing is drawn above the page — a section of chrome
 * repeated on every route earns its space only if it does something.
 */
export const AppShell = ({ children, identity, readiness }: AppShellProps) => {
  const { logout, user } = useAuth();
  const { pathname } = useLocation();

  const railFooter = (
    <>
      <Button component={Link} to="/" fullWidth start={<Icon name="plus" size="sm" />}>
        New analysis
      </Button>
      <a
        className="flex items-center gap-2 px-3 py-1.5 text-sm text-foreground-muted no-underline hover:text-foreground"
        href="https://github.com/openzentra/nexus"
        target="_blank"
        rel="noreferrer"
      >
        <Icon name="file_text" size="sm" />
        Docs
      </a>
      <a
        className="flex items-center gap-2 px-3 py-1.5 text-sm text-foreground-muted no-underline hover:text-foreground"
        href="https://github.com/openzentra/nexus/issues"
        target="_blank"
        rel="noreferrer"
      >
        <Icon name="help_circle" size="sm" />
        Help
      </a>
      <button
        type="button"
        onClick={() => void logout()}
        className="mt-2 flex items-center gap-2 rounded-sm border-t border-border px-3 pt-3 text-left text-sm text-foreground-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
      >
        <Avatar size="xs" name={user?.email ?? 'Account'} />
        <span className="min-w-0 truncate">{user?.email ?? 'Account'}</span>
        <Icon name="log_out" size="sm" className="ml-auto shrink-0" />
        <span className="sr-only">Sign out</span>
      </button>
    </>
  );

  return (
    <div className="flex h-screen bg-background text-foreground">
      <SideNav
        aria-label="Primary"
        brand={
          <>
            <ProductMark showRelease />
            <WorkspaceLockup identity={identity} readiness={readiness} />
          </>
        }
        footer={railFooter}
      >
        {navItems.map((item) => (
          <SideNav.Item
            key={item.to}
            component={Link}
            to={item.to}
            icon={<Icon name={item.icon} size="sm" />}
            active={isNavItemActive(item, pathname)}
          >
            {item.label}
          </SideNav.Item>
        ))}
      </SideNav>

      <main className="min-w-0 flex-1 overflow-y-auto">{children}</main>
    </div>
  );
};
