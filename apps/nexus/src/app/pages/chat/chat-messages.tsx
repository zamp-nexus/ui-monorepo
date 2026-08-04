import { MessagePrimitive } from '@assistant-ui/react';
import { motion } from 'framer-motion';

import { ChatTextPart } from './chat-text-part';
import { AnalysisRunFindingMessage } from './investigation-finding-message';
import { RouterClarificationMessage } from './router-clarification-message';

export const UserMessage = () => (
  <MessagePrimitive.Root className="flex justify-end">
    <motion.p
      initial={{ opacity: 0, scale: 0.95, y: 10 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={{ type: 'spring', stiffness: 400, damping: 25 }}
      className="max-w-2xl whitespace-pre-wrap rounded-2xl rounded-br-sm border border-border bg-gradient-to-br from-background-muted to-transparent px-4 py-3 text-sm text-foreground shadow-sm"
    >
      <MessagePrimitive.Content components={{ Text: ({ text }) => <>{text}</> }} />
    </motion.p>
  </MessagePrimitive.Root>
);

/**
 * Everything the assistant turn renders: plain text (a Conversational reply),
 * or one of the two tool calls this surface defines --
 * `analysis-run-finding` and `router-clarification` -- dispatched by name,
 * the same mechanism a real tool call would use.
 */
export const AssistantMessage = () => (
  <MessagePrimitive.Root>
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: 'easeOut' }}
    >
      <MessagePrimitive.Content
        components={{
          Text: ChatTextPart,
          tools: {
            by_name: {
              'analysis-run-finding': AnalysisRunFindingMessage,
              'router-clarification': RouterClarificationMessage,
            },
          },
        }}
      />
    </motion.div>
  </MessagePrimitive.Root>
);
