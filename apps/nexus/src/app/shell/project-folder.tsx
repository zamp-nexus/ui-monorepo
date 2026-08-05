

import { useState } from 'react';
import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { Link, useMatch } from 'react-router-dom';

import { Button, SideNav, Modal, IconButton, Input } from '@open-zentra/foundation-design-system';
import { Icon } from '@open-zentra/foundation-icons';

import type { TokenSource } from '../api';
import type { Group } from '../types';
import { listChats, renameGroup } from '../pages/chat/api';
interface GroupFolderProps {
  readonly group: Group;
  readonly getToken: TokenSource;
  readonly active: boolean;
  readonly expanded: boolean;
  readonly onSelect: (groupId: string) => void;
  readonly onToggle: (groupId: string) => void;
  readonly onNewChat: (groupId: string) => void;
}

export const GroupFolder = ({
  group,
  getToken,
  active,
  expanded,
  onSelect,
  onToggle,
  onNewChat,
}: GroupFolderProps) => {
  const queryClient = useQueryClient();
  const match = useMatch('/chats/:chatId');
  const activeThreadId = match?.params.chatId ?? null;
  const [isRenameModalOpen, setIsRenameModalOpen] = useState(false);
  const prefersReducedMotion = useReducedMotion();
  const chatPanelId = `group-chats-${group.group_id}`;

  const renameMutation = useMutation({
    mutationFn: (newName: string) => renameGroup(getToken, group.group_id, newName),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['groups'] });
      setIsRenameModalOpen(false);
    },
  });

  const history = useInfiniteQuery({
    queryKey: ['threads', group.group_id],
    queryFn: ({ pageParam }) => listChats(getToken, group.group_id, pageParam),
    initialPageParam: null as string | null,
    getNextPageParam: (page) => page.next_cursor,
    enabled: expanded,
  });

  const threads = history.data ? history.data.pages.flatMap((page) => page.items) : [];

  return (
    <div>
      <div className="group/folder relative w-full">
        <button
          type="button"
          aria-expanded={expanded}
          aria-controls={chatPanelId}
          className={`flex w-full min-w-0 items-center rounded-md px-3 py-2 pr-20 text-left text-sm hover:bg-secondary hover:text-foreground ${
            active ? 'bg-primary/10 text-primary' : 'text-foreground-muted'
          }`}
          onClick={() => onToggle(group.group_id)}
        >
          <span className="flex min-w-0 items-center gap-3">
            <Icon name={expanded ? 'folder_open' : 'folder'} size="sm" className="shrink-0" />
            <span className="truncate font-medium">{group.name}</span>
          </span>
        </button>
        <div className="absolute right-1 top-1 flex items-center gap-0.5 opacity-0 transition-opacity group-hover/folder:opacity-100 group-focus-within/folder:opacity-100">
          <IconButton
            intent="ghost"
            size="sm"
            aria-label={`New chat in ${group.name}`}
            onClick={(event) => {
              event.stopPropagation();
              onNewChat(group.group_id);
            }}
          >
            <Icon name="edit_3" size="xs" />
          </IconButton>
          <IconButton
            intent="ghost"
            size="sm"
            aria-label="Rename Group"
            onClick={(event) => {
              event.stopPropagation();
              setIsRenameModalOpen(true);
            }}
          >
            <Icon name="more_horizontal" size="sm" />
          </IconButton>
        </div>
      </div>

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

      <AnimatePresence initial={false}>
        {expanded ? (
          <motion.div
            id={chatPanelId}
            key={chatPanelId}
            role="region"
            aria-label={`Chats in ${group.name}`}
            initial={prefersReducedMotion ? false : { height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={prefersReducedMotion ? undefined : { height: 0, opacity: 0 }}
            transition={{ duration: prefersReducedMotion ? 0 : 0.16, ease: 'easeOut' }}
            className="overflow-hidden"
          >
            <motion.div
              initial={prefersReducedMotion ? false : { y: 4 }}
              animate={{ y: 0 }}
              transition={{ duration: prefersReducedMotion ? 0 : 0.16, ease: 'easeOut' }}
              className="flex flex-col gap-1 pb-2 pl-7 pr-2 pt-1"
            >
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
                    onClick={() => onSelect(group.group_id)}
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
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
};
