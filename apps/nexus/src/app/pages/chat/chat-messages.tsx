import { MessagePrimitive } from '@assistant-ui/react';

import { ChatTextPart } from './chat-text-part';
import { AnalysisRunFindingMessage } from './investigation-finding-message';
import { RouterClarificationMessage } from './router-clarification-message';

export const UserMessage = () => (
  <MessagePrimitive.Root className="flex justify-end">
    <p className="max-w-2xl whitespace-pre-wrap rounded-md bg-secondary px-4 py-3 text-sm text-foreground">
      <MessagePrimitive.Content components={{ Text: ({ text }) => <>{text}</> }} />
    </p>
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
  </MessagePrimitive.Root>
);
