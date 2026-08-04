import type { TextMessagePartProps } from '@assistant-ui/react';
import { motion } from 'framer-motion';

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
      <motion.span
        initial={{ opacity: 0.3 }}
        animate={{ opacity: 1 }}
        transition={{ repeat: Infinity, repeatType: 'reverse', duration: 0.7, ease: 'easeInOut' }}
        className="ml-1.5 inline-block h-2.5 w-2.5 rounded-full bg-primary align-middle shadow-[0_0_12px_var(--color-primary)]"
        aria-hidden="true"
      />
    ) : null}
  </>
);
