import { useMemo, useState, type FormEvent, type KeyboardEvent } from 'react';
import { motion } from 'framer-motion';

import { Badge, Button, IconButton } from '@open-zentra/foundation-design-system';
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
  const [isFocused, setIsFocused] = useState(false);
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
    <motion.form
      layout
      transition={{ type: 'spring', stiffness: 400, damping: 30 }}
      className={`relative w-full overflow-hidden rounded-3xl border border-glass-border bg-glass p-3 backdrop-blur-3xl transition-shadow duration-500 ease-out ${
        isFocused ? 'shadow-[0_0_40px_rgba(255,255,255,0.06)]' : 'shadow-lg'
      }`}
      onSubmit={submit}
      aria-label="Send a message"
    >
      <motion.div layout className="flex flex-col gap-3 rounded-2xl bg-background/40 p-3 transition-colors focus-within:bg-background/60">
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
        <textarea
          id="chat-message"
          className="max-h-48 w-full resize-none bg-transparent text-sm text-foreground outline-none placeholder:text-foreground-muted disabled:cursor-not-allowed"
          rows={rows}
          value={draft}
          disabled={disabled}
          placeholder={disabled ? 'Sending…' : 'Ask a governed question…'}
          onKeyDown={handleKeyDown}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
          onChange={(event) => {
            onDraftChange(event.target.value);
            setRows(Math.min(6, Math.max(1, event.target.value.split('\n').length)));
          }}
        />

        <motion.div layout className="flex items-center gap-1">
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
        </motion.div>
      </motion.div>

      <motion.p layout className="mt-2 text-center font-mono text-[10px] uppercase tracking-[0.14em] text-foreground-muted/70">
        Answers are drafts · every claim is rechecked before it becomes a Finding
      </motion.p>
    </motion.form>
  );
};
