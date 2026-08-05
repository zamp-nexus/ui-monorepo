import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';

import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useAuth } from '@open-zentra/foundation-auth';
import {
  Avatar,
  Button,
  Input,
  Modal,
  SideNav,
  Tooltip,
} from '@open-zentra/foundation-design-system';
import { Icon } from '@open-zentra/foundation-icons';

import { listGroups, createGroup } from '../pages/chat/api';
import { useActiveGroup } from '../pages/chat/use-active-group';
import { loadExpandedGroupIds, saveExpandedGroupIds } from './group-expansion-storage';
import { GroupFolder } from './project-folder';

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

interface ExpandedGroupsState {
  readonly organizationId: string;
  readonly groupIds: string[];
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
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');

  const initialGroup = useActiveGroup(getToken);
  const [groupId, setGroupId] = useState<string | null>(null);
  const [expandedGroupsState, setExpandedGroupsState] = useState<ExpandedGroupsState>(() => ({
    organizationId: identity.organization_id,
    groupIds: loadExpandedGroupIds(identity.organization_id),
  }));
  const expandedGroupIds =
    expandedGroupsState.organizationId === identity.organization_id
      ? expandedGroupsState.groupIds
      : [];

  const updateExpandedGroupIds = useCallback(
    (update: (current: string[]) => string[]) => {
      setExpandedGroupsState((current) => {
        const groupIds =
          current.organizationId === identity.organization_id
            ? current.groupIds
            : loadExpandedGroupIds(identity.organization_id);
        return { organizationId: identity.organization_id, groupIds: update(groupIds) };
      });
    },
    [identity.organization_id],
  );

  useEffect(() => {
    if (expandedGroupsState.organizationId === identity.organization_id) return;

    setExpandedGroupsState({
      organizationId: identity.organization_id,
      groupIds: loadExpandedGroupIds(identity.organization_id),
    });
  }, [expandedGroupsState.organizationId, identity.organization_id]);

  useEffect(() => {
    if (expandedGroupsState.organizationId !== identity.organization_id) return;

    saveExpandedGroupIds(identity.organization_id, expandedGroupIds);
  }, [expandedGroupIds, expandedGroupsState.organizationId, identity.organization_id]);

  // The first available Group is a sensible initial destination, but every
  // later selection is intentional: opening a Group or one of its chats
  // makes it the destination for the next new chat.
  useEffect(() => {
    if (!groupId && initialGroup.data) {
      setGroupId(initialGroup.data);
      updateExpandedGroupIds((current) =>
        current.includes(initialGroup.data) ? current : [...current, initialGroup.data],
      );
    }
  }, [groupId, initialGroup.data, updateExpandedGroupIds]);

  const selectGroup = useCallback((nextGroupId: string) => {
    setGroupId(nextGroupId);
    updateExpandedGroupIds((current) =>
      current.includes(nextGroupId) ? current : [...current, nextGroupId],
    );
  }, [updateExpandedGroupIds]);

  const toggleGroup = useCallback((nextGroupId: string) => {
    updateExpandedGroupIds((current) => {
      if (current.includes(nextGroupId)) {
        return current.filter((group) => group !== nextGroupId);
      }

      setGroupId(nextGroupId);
      return [...current, nextGroupId];
    });
  }, [updateExpandedGroupIds]);

  const groupsQuery = useQuery({
    queryKey: ['groups'],
    queryFn: () => listGroups(getToken),
    enabled: Boolean(initialGroup.data),
  });

  useEffect(() => {
    if (!groupsQuery.data) return;

    const availableGroupIds = new Set(groupsQuery.data.items.map((group) => group.group_id));
    updateExpandedGroupIds((current) => {
      const available = current.filter((group) => availableGroupIds.has(group));
      return available.length === current.length ? current : available;
    });
  }, [groupsQuery.data, updateExpandedGroupIds]);

  const createGroupMutation = useMutation({
    mutationFn: (name: string) => createGroup(getToken, name),
    onSuccess: (newGroup) => {
      queryClient.invalidateQueries({ queryKey: ['groups'] });
      selectGroup(newGroup.group_id);
      setNewGroupName('');
      setIsModalOpen(false);
      navigate('/chats'); // Automatically jump to chats list on workspace switch
    },
  });

  const startNewChat = useCallback(
    (nextGroupId: string) => {
      selectGroup(nextGroupId);
      navigate('/chats');
    },
    [navigate, selectGroup],
  );

  const railFooter = (
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

      <div className="-mx-3 mt-1 min-w-0 border-t border-border pt-3">
        <div className="px-3 [&>span]:min-w-0 [&>span]:w-full">
          <Tooltip content={`Sign out of ${user?.email ?? 'this account'}`} side="right" sideOffset={10}>
            <button
              type="button"
              onClick={() => void logout()}
              className="flex min-w-0 w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm text-foreground-muted transition-colors hover:bg-secondary hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
            >
              <Avatar size="xs" name={user?.email ?? 'Account'} />
              <span className="min-w-0 flex-1 truncate">{user?.email ?? 'Account'}</span>
              <Icon name="log_out" size="sm" className="ml-auto shrink-0" />
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
        className="hidden w-72 md:flex"
        brand={
          <ProductMark showRelease />
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

        <div className="-mx-3 mt-4 flex min-h-0 flex-1 flex-col border-t border-border pt-5">
          <div className="flex items-center justify-between px-3 pb-2">
            <h2 className="font-mono text-[10px] font-medium uppercase tracking-[0.14em] text-foreground-muted">
              Groups
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
                    value={newGroupName}
                    onChange={(e) => setNewGroupName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && newGroupName.trim().length > 0) {
                        createGroupMutation.mutate(newGroupName.trim());
                      }
                    }}
                  />
                </Modal.Body>
                <Modal.Footer>
                  <Button intent="ghost" onClick={() => setIsModalOpen(false)}>
                    Cancel
                  </Button>
                  <Button
                    disabled={newGroupName.trim().length === 0 || createGroupMutation.isPending}
                    onClick={() => createGroupMutation.mutate(newGroupName.trim())}
                  >
                    {createGroupMutation.isPending ? 'Creating...' : 'Create'}
                  </Button>
                </Modal.Footer>
              </Modal.Content>
            </Modal>
          </div>
          <div className="min-h-0 overflow-y-auto px-3 pb-3">
            <div className="flex flex-col gap-1">
              {groupsQuery.data?.items.map((g) => (
                <GroupFolder
                  key={g.group_id}
                  group={g}
                  getToken={getToken}
                  active={g.group_id === groupId}
                  expanded={expandedGroupIds.includes(g.group_id)}
                  onSelect={selectGroup}
                  onToggle={toggleGroup}
                  onNewChat={startNewChat}
                />
              ))}
            </div>
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
