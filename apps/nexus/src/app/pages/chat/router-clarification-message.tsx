import type { ToolCallMessagePartComponent } from '@assistant-ui/react';

import { Icon } from '@open-zentra/foundation-icons';

import { useChatContext } from './chat-context';
import type { RouterClarificationResult } from './to-chat-message';

/**
 * The `router-clarification` tool call: the router saying it could not map
 * the question to governed work, with the supported questions as chips --
 * telling someone "no" without telling them what "yes" looks like is a dead
 * end. Filling the composer, not sending immediately, is deliberate: a
 * suggestion is a starting point a reader may still edit.
 */
export const RouterClarificationMessage: ToolCallMessagePartComponent<
  Record<string, never>,
  RouterClarificationResult
> = ({ result }) => {
  const { onFillComposer } = useChatContext();
  if (!result) return null;

  return (
    <div className="flex gap-4">
      <span
        className="mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-sm bg-accent text-accent-foreground"
        aria-hidden="true"
      >
        <Icon name="help_circle" size="sm" />
      </span>

      <div className="min-w-0 flex-1">
        <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">{result.text}</p>

        {result.suggestions.length > 0 ? (
          <ul className="mt-4 flex list-none flex-wrap gap-2 p-0">
            {result.suggestions.map((prompt) => (
              <li key={prompt}>
                <button
                  type="button"
                  className="cursor-pointer rounded-sm border border-border bg-background px-3 py-1.5 text-left text-sm text-foreground-muted transition-colors hover:bg-secondary hover:text-foreground"
                  onClick={() => onFillComposer(prompt)}
                >
                  {prompt}
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </div>
  );
};
