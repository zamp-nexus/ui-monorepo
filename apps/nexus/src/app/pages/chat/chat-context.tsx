import { createContext, useContext } from 'react';

import type { TokenSource } from '../../api';
import type { Agent, ThreadEvent } from '../../types';

/**
 * What a message-level tool-call renderer needs that assistant-ui's part
 * props don't carry: how to authenticate a request, how to turn a follow-up
 * action into the next message sent, and -- for the Agent Activity block --
 * the Work Feed events that belong to this Analysis Run and the roster to
 * label them with.
 *
 * Threaded via context rather than props because `MessagePrimitive.Content`
 * dispatches to a tool renderer by name -- there is no path to pass extra,
 * per-app arguments through that dispatch.
 */
export interface ChatContextValue {
  readonly getToken: TokenSource;
  /** Sends a message immediately -- a rendered answer's own follow-up action. */
  readonly onFollowUp: (message: string) => void;
  /** Fills the composer's draft without sending -- a suggestion chip. */
  readonly onFillComposer: (prompt: string) => void;
  /** This Analysis Run's Work Feed events, keyed by `analysis_run_id`. */
  readonly activityByRun: ReadonlyMap<string, readonly ThreadEvent[]>;
  readonly agents: readonly Agent[];
}

const ChatContext = createContext<ChatContextValue | null>(null);

export const ChatContextProvider = ChatContext.Provider;

export const useChatContext = (): ChatContextValue => {
  const value = useContext(ChatContext);
  if (!value) {
    throw new Error('useChatContext must be used within a ChatContextProvider');
  }
  return value;
};
