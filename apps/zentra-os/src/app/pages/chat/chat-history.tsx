import { Button } from '@open-zentra/foundation-design-system';
import { Icon } from '@open-zentra/foundation-icons';

import type { ChatThread } from '../../types';

interface ChatHistoryProps {
  readonly threads: readonly ChatThread[];
  readonly activeThreadId: string | null;
  readonly onSelect: (threadId: string) => void;
  readonly onNewChat: () => void;
}

const relativeDay = (iso: string): string => {
  const days = Math.round((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  return `${days}d ago`;
};

/**
 * Past conversations, newest first.
 */
export const ChatHistory = ({
  threads,
  activeThreadId,
  onSelect,
  onNewChat,
}: ChatHistoryProps) => (
  <aside className="flex h-full w-72 shrink-0 flex-col gap-4 border-r border-border p-4">
    <Button fullWidth intent="secondary" start={<Icon name="plus" size="sm" />} onClick={onNewChat}>
      New chat
    </Button>

    <nav aria-label="Chat history" className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto">
      <h2 className="px-2 py-2 font-mono text-[10px] font-bold uppercase tracking-[0.16em] text-foreground-muted">
        Recent
      </h2>
      {threads.map((thread) => {
        const active = thread.thread_id === activeThreadId;
        return (
          <button
            key={thread.thread_id}
            type="button"
            aria-current={active ? 'true' : undefined}
            onClick={() => onSelect(thread.thread_id)}
            className={`flex flex-col gap-0.5 rounded-sm px-3 py-2 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus ${
              active
                ? 'bg-secondary text-foreground'
                : 'text-foreground-muted hover:bg-secondary hover:text-foreground'
            }`}
          >
            <span className="truncate text-sm">{thread.title}</span>
            <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-foreground-muted">
              {relativeDay(thread.updated_at)}
            </span>
          </button>
        );
      })}
    </nav>
  </aside>
);
