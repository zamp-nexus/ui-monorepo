import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';

import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useAuth } from '@open-zentra/foundation-auth';
import {
  Avatar,
  Button,
  IconButton,
  Input,
  Modal,
  SideNav,
  Tooltip,
  Accordion,
} from '@open-zentra/foundation-design-system';
import { Icon } from '@open-zentra/foundation-icons';

import { listGroups, createGroup } from '../pages/chat/api';
import { useActiveGroup } from '../pages/chat/use-active-group';
import { ProjectFolder } from './project-folder';

import type { TokenSource } from '../api';
import type { IdentityContext, ReadinessResponse } from '../types';
import { isNavItemActive, navItems } from './nav-items';
import { ProductMark } from './product-mark';

interface AppShellProps {
  readonly children: ReactNode;
  readonly identity: IdentityContext;
  readonly readiness: ReadinessResponse | undefined;
  readonly getToken: TokenSource;
}

interface WorkspaceContextValue {
  groupId: string | null;
  selectGroup: (groupId: string) => void;
}

export const WorkspaceContext = createContext<WorkspaceContextValue>({
  groupId: null,
  selectGroup: () => undefined,
});
export const useWorkspace = () => useContext(WorkspaceContext);


/**
 * The frame every authenticated page renders inside: the navigation rail, and
 * the page itself. Nothing is drawn above the page — a section of chrome
 * repeated on every route earns its space only if it does something.
 */
export const AppShell = ({ children, identity, readiness, getToken }: AppShellProps) => {
  const { logout, user } = useAuth();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [collapsed, setCollapsed] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');

  const initialGroup = useActiveGroup(getToken);
  const [groupId, setGroupId] = useState<string | null>(null);

  // Track expanded accordion items
  const [expandedGroups, setExpandedGroups] = useState<string[]>([]);

  // The first available Group is a sensible initial destination, but every
  // later selection is intentional: opening a project or one of its chats
  // makes it the destination for the next new chat.
  useEffect(() => {
    if (!groupId && initialGroup.data) {
      setGroupId(initialGroup.data);
      setExpandedGroups((current) => (current.length === 0 ? [initialGroup.data] : current));
    }
  }, [groupId, initialGroup.data]);

  const selectGroup = useCallback((nextGroupId: string) => {
    setGroupId(nextGroupId);
    setExpandedGroups((current) =>
      current.includes(nextGroupId) ? current : [...current, nextGroupId],
    );
  }, []);

  const groupsQuery = useQuery({
    queryKey: ['groups'],
    queryFn: () => listGroups(getToken),
    enabled: Boolean(initialGroup.data),
  });

  const createGroupMutation = useMutation({
    mutationFn: (name: string) => createGroup(getToken, name),
    onSuccess: (newGroup) => {
      queryClient.invalidateQueries({ queryKey: ['groups'] });
      selectGroup(newGroup.group_id);
      setNewProjectName('');
      setIsModalOpen(false);
      navigate('/chats'); // Automatically jump to chats list on workspace switch
    },
  });

  const railFooter = (
    <>
      {/* Collapsed, the primary action is a tile the same size as a nav item,
          so the rail stays one column of squares. */}
      {collapsed ? (
        <Tooltip content="New chat" side="right" sideOffset={10}>
          <Button component={Link} to="/" aria-label="New chat" className="h-11 w-11 p-0">
            <Icon name="plus" size="sm" />
          </Button>
        </Tooltip>
      ) : (
        <Button component={Link} to="/" fullWidth start={<Icon name="plus" size="sm" />}>
          New chat
        </Button>
      )}

      {collapsed ? null : (
        <>
          <Link
            className="flex min-h-10 items-center gap-2 px-3 py-1.5 text-sm text-foreground-muted no-underline transition-colors hover:text-foreground"
            to="/settings"
          >
            <Icon name="settings" size="sm" />
            Settings
          </Link>
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
        </>
      )}

      <div
        className={`mt-1 min-w-0 border-t border-border pt-3 ${
          collapsed ? 'w-full' : '-mx-3 w-auto'
        }`}
      >
        <div
          className={
            collapsed ? 'flex justify-center' : 'px-3 [&>span]:w-full [&>span]:min-w-0'
          }
        >
          <Tooltip
            content={`Sign out of ${user?.email ?? 'this account'}`}
            side="right"
            sideOffset={10}
          >
            <button
              type="button"
              onClick={() => void logout()}
              className={`flex min-w-0 items-center gap-2 rounded-md text-left text-sm text-foreground-muted transition-colors hover:bg-secondary hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus ${
                collapsed ? 'h-11 w-11 justify-center p-0' : 'w-full px-3 py-2'
              }`}
            >
              <Avatar size="xs" name={user?.email ?? 'Account'} />
              {collapsed ? null : (
                <>
                  <span className="min-w-0 flex-1 truncate">{user?.email ?? 'Account'}</span>
                  <Icon name="log_out" size="sm" className="ml-auto shrink-0" />
                </>
              )}
              <span className="sr-only">Sign out</span>
            </button>
          </Tooltip>
        </div>
      </div>
    </>
  );

  return (
    <div className="flex h-screen bg-background text-foreground selection:bg-primary/15 selection:text-primary-foreground">
      <SideNav
        aria-label="Primary"
        width={collapsed ? 'compact' : 'default'}
        className="hidden md:flex"
        brand={
          <div className="flex w-full items-start justify-between gap-1">
            <ProductMark showRelease compact={collapsed} />
            <Tooltip
              content={collapsed ? 'Expand navigation' : 'Collapse navigation'}
              side="right"
              sideOffset={10}
            >
              <IconButton
                aria-label={collapsed ? 'Expand navigation' : 'Collapse navigation'}
                intent="ghost"
                size="sm"
                onClick={() => setCollapsed((open) => !open)}
              >
                <Icon name={collapsed ? 'chevron_right' : 'chevron_left'} size="sm" />
              </IconButton>
            </Tooltip>
          </div>
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

        <div className={`mt-4 ${collapsed ? '' : '-mx-3 border-t border-border pt-5 px-3'}`}>
          {collapsed ? null : (
            <div className="flex items-center justify-between px-3 pb-2">
              <h2 className="font-mono text-[10px] font-medium uppercase tracking-[0.14em] text-foreground-muted">
                Projects
              </h2>
              <Modal open={isModalOpen} onOpenChange={setIsModalOpen}>
                <Modal.Trigger
                  aria-label="New Group"
                  className="inline-flex h-8 w-8 items-center justify-center rounded-md text-foreground transition-colors hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
                >
                  <Icon name="plus" size="sm" />
                </Modal.Trigger>
                <Modal.Content>
                  <Modal.Header>
                    <Modal.Title>Create New Group</Modal.Title>
                    <Modal.Description>Enter a name for your new group.</Modal.Description>
                    <Modal.Close />
                  </Modal.Header>
                  <Modal.Body>
                    <Input
                      autoFocus
                      placeholder="e.g. Acme Corp"
                      value={newProjectName}
                      onChange={(e) => setNewProjectName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && newProjectName.trim().length > 0) {
                          createGroupMutation.mutate(newProjectName.trim());
                        }
                      }}
                    />
                  </Modal.Body>
                  <Modal.Footer>
                    <Button intent="ghost" onClick={() => setIsModalOpen(false)}>
                      Cancel
                    </Button>
                    <Button
                      disabled={newProjectName.trim().length === 0 || createGroupMutation.isPending}
                      onClick={() => createGroupMutation.mutate(newProjectName.trim())}
                    >
                      {createGroupMutation.isPending ? 'Creating...' : 'Create'}
                    </Button>
                  </Modal.Footer>
                </Modal.Content>
              </Modal>
            </div>
          )}
          
          <div className="flex flex-col gap-1">
            <Accordion
              multiple={true}
              value={expandedGroups}
              onValueChange={setExpandedGroups}
              className="flex flex-col gap-1"
            >
              {groupsQuery.data?.items.map((g) => (
                <ProjectFolder
                  key={g.group_id}
                  group={g}
                  getToken={getToken}
                  collapsed={collapsed}
                  active={g.group_id === groupId}
                  onSelect={selectGroup}
                />
              ))}
            </Accordion>
          </div>
        </div>
      </SideNav>

      <main className="min-w-0 flex-1 overflow-y-auto">
        <header className="sticky top-0 z-10 flex min-h-14 items-center justify-between border-b border-border bg-card/95 px-4 backdrop-blur md:hidden">
          <ProductMark compact />
          <nav className="flex items-center gap-1" aria-label="Mobile primary">
            {navItems.map((item) => (
              <Link
                key={item.to}
                to={item.to}
                className={`inline-flex min-h-10 items-center rounded-md px-3 text-sm font-medium no-underline ${isNavItemActive(item, pathname) ? 'bg-primary/10 text-primary' : 'text-foreground-muted'}`}
              >
                {item.label}
              </Link>
            ))}
          </nav>
        </header>
        <WorkspaceContext.Provider value={{ groupId, selectGroup }}>
          {children}
        </WorkspaceContext.Provider>
      </main>
    </div>
  );
};
