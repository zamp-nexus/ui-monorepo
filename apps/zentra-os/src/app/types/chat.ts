/**
 * The shapes the chat surface renders.
 *
 * Written as the contract the API will be held to, not as whatever the mock
 * fixture happens to contain: fields are snake_case and readonly like every
 * other API type here, and message content is markdown because that is what an
 * agent produces.
 */

import type { IconName } from '@open-zentra/foundation-icons';

export type ChatRole = 'user' | 'assistant';

export interface ChatMessage {
  readonly message_id: string;
  readonly role: ChatRole;
  /** Markdown. Rendered, never injected as HTML. */
  readonly content: string;
  readonly created_at: string;
  /**
   * An Investigation this answer came from, when the agent opened one.
   * Null for an answer that needed no governed query.
   */
  readonly investigation_id: string | null;
}

export interface ChatThread {
  readonly thread_id: string;
  readonly title: string;
  readonly updated_at: string;
  readonly messages: readonly ChatMessage[];
}

/** A starting question offered on an empty thread. */
export interface ChatSuggestion {
  readonly suggestion_id: string;
  readonly icon: IconName;
  readonly label: string;
  /** What is sent when the card is chosen. */
  readonly prompt: string;
}
