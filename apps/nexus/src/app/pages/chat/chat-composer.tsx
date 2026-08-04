import { useMemo, useState, type FormEvent, type KeyboardEvent } from 'react';

import { Badge, Button, IconButton, Textarea } from '@open-zentra/foundation-design-system';
import { Icon } from '@open-zentra/foundation-icons';

import { parseComposerCommands } from './composer-commands';

interface ChatComposerProps {
  readonly onSend: (message: string) => void;
  readonly disabled: boolean;
  /** Prefilled from a suggestion card. */
  readonly draft: string;
  readonly onDraftChange: (draft: string) => void;
}

/**
 * The message box.
 *
 * Enter sends and Shift+Enter breaks the line — the convention a chat surface
 * is judged by. The attachment controls are drawn but disabled: they say what
 * is coming without pretending to work.
 *
 * `#dataset`, `@user`, and `/skill` (ADR-0032) are parsed live and shown as
 * chips; the stripped text, not the raw draft, is what gets sent -- these are
 * metadata on the message, not part of the question itself.
 */
export const ChatComposer = ({ onSend, disabled, draft, onDraftChange }: ChatComposerProps) => {
  const [rows, setRows] = useState(1);
  const parsed = useMemo(() => parseComposerCommands(draft), [draft]);
  const hasCommands = Boolean(parsed.datasetHint || parsed.mentions.length > 0 || parsed.skillHint);

  const submit = (event?: FormEvent) => {
    event?.preventDefault();
    const message = parsed.text;
    if (!message || disabled) return;
    onSend(message);
    setRows(1);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      submit();
    }
  };

  return (
    <form
      className="w-full border-t border-border bg-background px-4 pb-4 pt-3 sm:px-6"
      onSubmit={submit}
      aria-label="Send a message"
    >
      <div className="mx-auto flex max-w-3xl flex-col gap-3 rounded-xl border border-border bg-card p-3 shadow-[var(--shadow-depth-01)] transition-[border-color,box-shadow] focus-within:border-primary/70 focus-within:shadow-[var(--focus-ring)]">
        {hasCommands ? (
          <div className="flex flex-wrap items-center gap-2" aria-live="polite">
            {parsed.datasetHint ? (
              <Badge intent="info" size="sm">
                #{parsed.datasetHint}
              </Badge>
            ) : null}
            {parsed.mentions.map((mention) => (
              <Badge
                key={mention}
                intent="secondary"
                size="sm"
                title="Mentions have no effect yet -- there is no notification system to send them to."
              >
                @{mention}
              </Badge>
            ))}
            {parsed.skillHint ? (
              <Badge
                intent="secondary"
                size="sm"
                title="This names a capability directly, but Intake still validates it against your Analytical Scope -- it's a hint, not a bypass."
              >
                /{parsed.skillHint}
              </Badge>
            ) : null}
          </div>
        ) : null}

        <label className="sr-only" htmlFor="chat-message">
          Message
        </label>
        <Textarea
          id="chat-message"
          className="max-h-48 w-full resize-none border-0 bg-transparent p-0 text-sm text-foreground shadow-none outline-none placeholder:text-foreground-muted focus-visible:border-0 focus-visible:ring-0 focus-visible:ring-offset-0 disabled:cursor-not-allowed"
          rows={rows}
          value={draft}
          disabled={disabled}
          placeholder={disabled ? 'Working on your question…' : 'Ask anything about your data…'}
          onKeyDown={handleKeyDown}
          onChange={(event) => {
            onDraftChange(event.target.value);
            setRows(Math.min(6, Math.max(1, event.target.value.split('\n').length)));
          }}
        />

        <div className="flex items-center gap-1">
          <IconButton aria-label="Attach a file" intent="ghost" size="sm" disabled>
            <Icon name="clipboard" size="sm" />
          </IconButton>
          <IconButton aria-label="Mention a dataset" intent="ghost" size="sm" disabled>
            <Icon name="tag" size="sm" />
          </IconButton>
          <IconButton aria-label="Attach an image" intent="ghost" size="sm" disabled>
            <Icon name="image" size="sm" />
          </IconButton>

          <Button
            className="ml-auto"
            type="submit"
            size="sm"
            disabled={disabled || parsed.text.length === 0}
            end={<Icon name="send" size="sm" />}
          >
            Send
          </Button>
        </div>
      </div>
    </form>
  );
};
