

import { useState } from 'react';
import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link, useMatch } from 'react-router-dom';

import { Accordion, Button, SideNav, Modal, IconButton, Input } from '@open-zentra/foundation-design-system';
import { Icon } from '@open-zentra/foundation-icons';

import type { TokenSource } from '../api';
import type { Group } from '../types';
import { listChats, renameGroup } from '../pages/chat/api';
import { useWorkspace } from './app-shell';

interface ProjectFolderProps {
  readonly group: Group;
  readonly getToken: TokenSource;
  readonly collapsed: boolean;
}

export const ProjectFolder = ({ group, getToken, collapsed }: ProjectFolderProps) => {
  const queryClient = useQueryClient();
  useWorkspace(); // Ensure we're in a workspace context if needed, otherwise this can be removed too.
  const match = useMatch('/chats/:chatId');
  const activeThreadId = match?.params.chatId ?? null;
  const [isRenameModalOpen, setIsRenameModalOpen] = useState(false);

  const renameMutation = useMutation({
    mutationFn: (newName: string) => renameGroup(getToken, group.group_id, newName),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['groups'] });
      setIsRenameModalOpen(false);
    },
  });

  // We can determine if this accordion is open by checking if it matches the group id?
  // No, the Accordion controls its own state, but we don't have access to the context here directly without a hook.
  // Actually, we can just fetch if enabled: true always. The design system's Accordion handles visibility.
  // BUT to avoid fetching all groups, we can assume it's true for now, or just let it fetch (they are paginated small lists).
  // Or better, let's just fetch them. It's a sidebar, we want the data.
  const history = useInfiniteQuery({
    queryKey: ['threads', group.group_id],
    queryFn: ({ pageParam }) => listChats(getToken, group.group_id, pageParam),
    initialPageParam: null as string | null,
    getNextPageParam: (page) => page.next_cursor,
  });

  const threads = history.data ? history.data.pages.flatMap((page) => page.items) : [];

  return (
    <Accordion.Item value={group.group_id} className="border-none">
      <Accordion.Trigger
        className={`flex w-full items-center justify-between rounded-md px-3 py-2 text-sm text-foreground-muted hover:bg-secondary hover:text-foreground hover:no-underline [&[data-panel-open]>svg]:rotate-90 ${
          collapsed ? 'justify-center p-0 h-11 w-11' : ''
        }`}
      >
        <div className="flex min-w-0 items-center gap-3 w-full group/folder">
          <Icon name="folder" size="sm" className="shrink-0" />
          {!collapsed && (
            <div className="flex w-full items-center justify-between min-w-0">
              <span className="truncate font-medium">{group.name}</span>
              <IconButton
                intent="ghost"
                size="sm"
                aria-label="Rename Group"
                className="opacity-0 group-hover/folder:opacity-100 transition-opacity"
                onClick={(e) => {
                  e.stopPropagation();
                  e.preventDefault();
                  setIsRenameModalOpen(true);
                }}
              >
                <Icon name="edit" size="xs" />
              </IconButton>
            </div>
          )}
        </div>
      </Accordion.Trigger>

      <Modal open={isRenameModalOpen} onOpenChange={setIsRenameModalOpen}>
        <Modal.Content onClick={(e) => e.stopPropagation()}>
          <Modal.Header>
            <Modal.Title>Rename Group</Modal.Title>
            <Modal.Description>Enter a new name for this group.</Modal.Description>
            <Modal.Close />
          </Modal.Header>
          <Modal.Body>
            <Input
              autoFocus
              defaultValue={group.name}
              placeholder="e.g. Sales Team"
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  if (e.currentTarget.value.trim() && e.currentTarget.value.trim() !== group.name) {
                    renameMutation.mutate(e.currentTarget.value.trim());
                  } else {
                    setIsRenameModalOpen(false);
                  }
                }
              }}
            />
          </Modal.Body>
        </Modal.Content>
      </Modal>

      <Accordion.Content className={collapsed ? 'hidden' : ''}>
        <div className="flex flex-col gap-1 pb-2 pl-7 pr-2 pt-1">
          {history.isFetching && !history.data ? (
            <p className="px-3 py-2 text-xs text-foreground-muted">Loading...</p>
          ) : threads.length === 0 ? (
            <p className="px-3 py-2 text-xs text-foreground-muted">No chats</p>
          ) : (
            threads.map((thread) => (
              <SideNav.Item
                key={thread.thread_id}
                component={Link}
                to={`/chats/${thread.thread_id}`}
                active={thread.thread_id === activeThreadId}
                className="h-auto py-1.5 px-3 rounded-md transition-colors"
              >
                <div className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-sm">{thread.title}</span>
                </div>
              </SideNav.Item>
            ))
          )}
          {history.hasNextPage && (
            <Button
              intent="ghost"
              size="sm"
              onClick={() => void history.fetchNextPage()}
              disabled={history.isFetching}
              className="mt-1 h-7 text-xs justify-start px-3"
            >
              Load older
            </Button>
          )}
        </div>
      </Accordion.Content>
    </Accordion.Item>
  );
};
