import { createContext, useContext, useState, type ReactNode } from 'react';

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
}

export const WorkspaceContext = createContext<WorkspaceContextValue>({ groupId: null });
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

  const group = useActiveGroup(getToken);
  const groupId = group.data ?? null;

  // Track expanded accordion items
  const [expandedGroups, setExpandedGroups] = useState<string[]>(groupId ? [groupId] : []);

  const groupsQuery = useQuery({
    queryKey: ['groups'],
    queryFn: () => listGroups(getToken),
    enabled: Boolean(group.data),
  });

  const createGroupMutation = useMutation({
    mutationFn: (name: string) => createGroup(getToken, name),
    onSuccess: (newGroup) => {
      queryClient.invalidateQueries({ queryKey: ['groups'] });
      setExpandedGroups((prev) => [...prev, newGroup.group_id]);
      setNewProjectName('');
      setIsModalOpen(false);
      navigate('/chats'); // Automatically jump to chats list on workspace switch
    },
  });

  const railFooter = (
    <>
      <IconButton
        aria-label={collapsed ? 'Expand navigation' : 'Collapse navigation'}
        intent="ghost"
        size="sm"
        className={collapsed ? undefined : 'self-end'}
        onClick={() => setCollapsed((open) => !open)}
      >
        <Icon name={collapsed ? 'chevron_right' : 'chevron_left'} size="sm" />
      </IconButton>

      {/* Collapsed, the primary action is a tile the same size as a nav item,
          so the rail stays one column of squares. */}
      {collapsed ? (
        <Tooltip content="New analysis" side="right" sideOffset={10}>
          <Button component={Link} to="/" aria-label="New analysis" className="h-11 w-11 p-0">
            <Icon name="plus" size="sm" />
          </Button>
        </Tooltip>
      ) : (
        <Button component={Link} to="/" fullWidth start={<Icon name="plus" size="sm" />}>
          New analysis
        </Button>
      )}

      {collapsed ? null : (
        <>
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

      <div className="mt-1 w-full min-w-0 border-t border-border pt-3 [&>span]:w-full [&>span]:min-w-0">
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
    </>
  );

  return (
    <div className="flex h-screen bg-background text-foreground selection:bg-primary/30 selection:text-primary-foreground">
      <SideNav
        aria-label="Primary"
        width={collapsed ? 'compact' : 'default'}
        brand={
          <div className="flex w-full flex-col gap-4">
            <ProductMark showRelease compact={collapsed} />
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

        <div className={`mt-2 ${collapsed ? '' : 'border-t border-border pt-4'}`}>
          {collapsed ? null : (
            <div className="flex items-center justify-between px-3 pb-2">
              <h2 className="font-mono text-[10px] font-bold uppercase tracking-[0.16em] text-foreground-muted">
                Groups
              </h2>
              <Modal open={isModalOpen} onOpenChange={setIsModalOpen}>
                <Modal.Trigger asChild>
                  <IconButton
                    intent="ghost"
                    size="sm"
                    aria-label="New Group"
                  >
                    <Icon name="plus" size="sm" />
                  </IconButton>
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
                    <Modal.Close asChild>
                      <Button intent="ghost">Cancel</Button>
                    </Modal.Close>
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
                <ProjectFolder key={g.group_id} group={g} getToken={getToken} collapsed={collapsed} />
              ))}
            </Accordion>
          </div>
        </div>
      </SideNav>

      <main className="min-w-0 flex-1 overflow-y-auto">
        <WorkspaceContext.Provider value={{ groupId }}>
          {children}
        </WorkspaceContext.Provider>
      </main>
    </div>
  );
};
