import type { TextMessagePartProps } from '@assistant-ui/react';

import { Markdown } from '../../components/markdown';

/**
 * The `Text` part renderer for an assistant message.
 *
 * The cursor is the part's own streaming status, not a prop threaded down
 * from the page -- `use-send-message`'s reveal timer already paces
 * `content`, and marking the synthesized message `status: { type: 'running' }`
 * (see `chat-runtime.ts`) is what makes this part report `running` too.
 */
export const ChatTextPart = ({ text, status }: TextMessagePartProps) => (
  <>
    <Markdown>{text}</Markdown>
    {status?.type === 'running' ? (
      <span
        className="ml-0.5 inline-block h-4 w-[2px] animate-pulse bg-foreground align-text-bottom"
        aria-hidden="true"
      />
    ) : null}
  </>
);
