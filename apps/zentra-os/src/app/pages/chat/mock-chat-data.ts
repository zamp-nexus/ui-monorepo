/**
 * Hardcoded chat fixture.
 *
 * Nothing here reaches the API. It exists so the surface can be built and
 * reviewed before the conversation endpoints exist, and it is deliberately the
 * only file that has to be deleted when they do: everything else reads the
 * types in `types/chat.ts`.
 */

import type { ChatSuggestion, ChatThread } from '../../types';

export const chatSuggestions: readonly ChatSuggestion[] = [
  {
    suggestion_id: 'refund-spike',
    icon: 'search',
    label: 'Investigate a metric change',
    prompt: 'Why did EU refunds increase from June to July 2026?',
  },
  {
    suggestion_id: 'pending-approvals',
    icon: 'check_circle',
    label: 'What is waiting on me?',
    prompt: 'Which findings are waiting for my approval?',
  },
  {
    suggestion_id: 'datasets',
    icon: 'database',
    label: 'What data am I bound to?',
    prompt: 'Which snapshot is the EU refund investigation bound to?',
  },
  {
    suggestion_id: 'governed-metrics',
    icon: 'list',
    label: 'List governed metrics',
    prompt: 'Which metrics may I ask about in EU commerce?',
  },
];

export const mockThreads: readonly ChatThread[] = [
  {
    thread_id: 'thread-eu-refunds',
    title: 'Why did EU refunds increase from June to July?',
    updated_at: '2026-08-01T09:12:00Z',
    messages: [
      {
        message_id: 'm1',
        role: 'user',
        content: 'Why did EU refunds increase from June to July 2026?',
        created_at: '2026-08-01T09:10:00Z',
        investigation_id: null,
      },
      {
        message_id: 'm2',
        role: 'assistant',
        created_at: '2026-08-01T09:12:00Z',
        investigation_id: '30000000-0000-0000-0000-000000000003',
        content: `I opened an Investigation and ran it against the **governed EU commerce snapshot**. Here is what the evidence supports.

### What changed

| Metric | June 2026 | July 2026 | Change |
| --- | --- | --- | --- |
| Refund amount | $20.00 | $260.00 | +$240.00 |
| Refund rate | 25% | 75% | +50pp |
| Order volume | 8 | 8 | flat |

Refund *amount* rose while order volume stayed flat, so this is not a volume effect.

### What the evidence does not say

The recheck reached **42% confidence**, below your tenant threshold, so this is
a Draft Finding and is waiting on your judgment. Root cause is \`unresolved\`:
the evidence shows what changed, not why.

> Every claim above resolves to a citation in the evidence trace. Nothing here
> has been published to your tenant yet.

Open the [evidence trace](/investigations/30000000-0000-0000-0000-000000000003)
to approve or reject it.`,
      },
    ],
  },
  {
    thread_id: 'thread-approvals',
    title: 'Which findings are waiting for my approval?',
    updated_at: '2026-07-31T16:40:00Z',
    messages: [
      {
        message_id: 'm3',
        role: 'user',
        content: 'Which findings are waiting for my approval?',
        created_at: '2026-07-31T16:39:00Z',
        investigation_id: null,
      },
      {
        message_id: 'm4',
        role: 'assistant',
        created_at: '2026-07-31T16:40:00Z',
        investigation_id: null,
        content: `Two Investigations are gated on a human decision:

1. **EU refund spike** — confidence below threshold (42%). Requested 2 days ago.
2. **NA channel growth** — an open contradiction the recheck did not resolve.

Both need owner or admin judgment. I cannot decide either for you.`,
      },
    ],
  },
  {
    thread_id: 'thread-metrics',
    title: 'Which metrics may I ask about in EU commerce?',
    updated_at: '2026-07-30T11:05:00Z',
    messages: [
      {
        message_id: 'm5',
        role: 'user',
        content: 'Which metrics may I ask about in EU commerce?',
        created_at: '2026-07-30T11:04:00Z',
        investigation_id: null,
      },
      {
        message_id: 'm6',
        role: 'assistant',
        created_at: '2026-07-30T11:05:00Z',
        investigation_id: null,
        content: `Your approved semantic model exposes:

- \`refund_amount\` — sum of refunded value, in USD
- \`refund_rate\` — refunded orders over total orders
- \`order_volume\` — count of completed orders
- \`gross_margin\` — revenue less cost of goods

Anything outside this list has to be defined and approved before an agent may
query it.`,
      },
    ],
  },
];

/**
 * The canned answer a new message gets.
 *
 * One reply, clearly a placeholder, rather than a fake that pretends to have
 * read the question.
 */
export const mockAssistantReply = (prompt: string): string =>
  `I cannot answer **${prompt.trim().slice(0, 120)}** yet — this surface is not
connected to the agent runtime.

When it is, an answer here will carry:

- the governed metrics it read
- the Investigation it opened, if any
- a citation for every substantive claim

Until then the conversation above is a fixture.`;
