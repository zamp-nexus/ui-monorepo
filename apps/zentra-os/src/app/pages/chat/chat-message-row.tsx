import { Icon } from '@open-zentra/foundation-icons';
import { Link } from 'react-router-dom';

import { Markdown } from '../../components/markdown';
import type { ChatMessage } from '../../types';

/**
 * One turn of the conversation.
 *
 * The question is shown as written — plain text in a bubble. The answer is
 * markdown from an agent, so it is parsed and laid out as a document.
 */
export const ChatMessageRow = ({ message }: { readonly message: ChatMessage }) => {
  if (message.role === 'user') {
    return (
      <div className="flex justify-end">
        <p className="max-w-2xl whitespace-pre-wrap rounded-sm border border-border bg-background-muted px-4 py-3 text-sm text-foreground">
          {message.content}
        </p>
      </div>
    );
  }

  return (
    <div className="flex gap-4">
      <span
        className="mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-sm bg-accent text-accent-foreground"
        aria-hidden="true"
      >
        <Icon name="sparkles" size="sm" />
      </span>

      <div className="min-w-0 flex-1">
        <Markdown>{message.content}</Markdown>

        {/* Where the answer came from, not just what it said. */}
        {message.investigation_id ? (
          <Link
            className="mt-4 inline-flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.14em] text-primary no-underline hover:underline"
            to={`/investigations/${message.investigation_id}`}
          >
            <Icon name="search" size="sm" />
            Open the evidence trace
          </Link>
        ) : null}
      </div>
    </div>
  );
};
