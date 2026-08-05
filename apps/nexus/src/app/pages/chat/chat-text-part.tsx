import type { TextMessagePartProps } from '@assistant-ui/react';
import { motion, useReducedMotion } from 'motion/react';

import { Markdown } from '../../components/markdown';
import { CopyMessageButton } from './copy-message-button';

/**
 * The `Text` part renderer for an assistant message.
 *
 * The cursor is the part's own streaming status, not a prop threaded down
 * from the page -- `use-send-message`'s reveal timer already paces
 * `content`, and marking the synthesized message `status: { type: 'running' }`
 * (see `chat-runtime.ts`) is what makes this part report `running` too.
 */
export const ChatTextPart = ({ text, status }: TextMessagePartProps) => {
  const prefersReducedMotion = useReducedMotion();
  const isLive = status?.type === 'running';
  const hasText = text.trim().length > 0;

  return (
    <motion.div
      className="group/message"
      initial={isLive && !prefersReducedMotion ? { opacity: 0, y: 4 } : false}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.18, ease: 'easeOut' }}
    >
      <Markdown>{text}</Markdown>
      {isLive && hasText ? (
        <span
          className="ml-0.5 inline-block h-4 w-[2px] animate-pulse bg-foreground align-text-bottom motion-reduce:animate-none"
          aria-hidden="true"
        />
      ) : null}
      <div className="mt-1 flex h-7 items-center">
        <CopyMessageButton text={text} />
      </div>
    </motion.div>
  );
};
