/**
 * What the agents are doing, while they are doing it.
 *
 * Every line here comes from the public Work Feed, which is the only stream
 * the server considers safe to show: a `summary` is a sentence an agent wrote
 * for a reader, never a prompt, a row, or a credential. Nothing is inferred
 * from timing or invented to fill a gap — if the feed says nothing, the rail
 * says nothing.
 *
 * Agents are named from `/v1/agents` rather than from a table in here. The
 * roster is registry data and can change without this file being touched.
 */

import { Badge } from '@open-zentra/foundation-design-system';
import { Icon, type IconName } from '@open-zentra/foundation-icons';
import { motion, AnimatePresence } from 'framer-motion';

import type { Agent, AgentEventPayload, ThreadEvent } from '../../types';
import type { FeedStatus } from './use-thread-events';

/**
 * One icon per Agent Role, so the rail reads at a glance instead of every
 * line looking identical. Keyed by the same `role` string every
 * `AgentEventPayload` already carries (`AgentRole` values from the backend) —
 * no new lookup, just rendering a field that was already there.
 */
export const ROLE_ICON: Record<string, IconName> = {
  orchestrator: 'compass',
  cube_analyst: 'database',
  sql_analyst: 'database',
  evaluator: 'shield',
  statistician: 'shield',
  insight: 'sparkles',
  insight_root_cause: 'sparkles',
  conversational: 'message_square',
  intake: 'compass',
  knowledge: 'compass',
  visualization: 'grid',
};
export const DEFAULT_ROLE_ICON: IconName = 'sparkles';

interface Line {
  readonly id: string;
  readonly agentId: string | null;
  readonly role: string | null;
  readonly text: string;
  readonly done: boolean;
  /** The Agent's own account of why, from `agent.completed`. Distinct from
   * `text` (a status sentence) -- rendered as its own, visually lighter line. */
  readonly reasoning: string | null;
}

const isAgentPayload = (
  event: ThreadEvent,
): event is ThreadEvent & {
  readonly payload: AgentEventPayload;
} => event.payload.type === 'agent';

/**
 * Reduce the feed to the lines worth showing.
 *
 * `agent.capability_used` is dropped: it fires often, says little a reader can
 * act on, and would bury the sentences that do.
 */
export const progressLines = (events: readonly ThreadEvent[]): readonly Line[] => {
  const lines: Line[] = [];

  for (const event of events) {
    if (event.kind === 'analysis_run.queued') {
      lines.push({
        id: event.event_id,
        agentId: null,
        role: null,
        text: 'Analysis Run queued.',
        done: true,
        reasoning: null,
      });
      continue;
    }
    if (event.kind === 'finding.published' && event.payload.type === 'finding') {
      lines.push({
        id: event.event_id,
        agentId: null,
        role: 'insight',
        text: `Finding published with ${event.payload.citation_count} citations.`,
        done: true,
        reasoning: null,
      });
      continue;
    }
    if (!isAgentPayload(event)) continue;

    const payload = event.payload;
    if (event.kind === 'agent.started') {
      lines.push({
        id: event.event_id,
        agentId: payload.agent_id,
        role: payload.role,
        text: payload.summary ?? 'Working…',
        done: false,
        reasoning: null,
      });
      continue;
    }
    if (event.kind === 'agent.public_update' && payload.summary) {
      lines.push({
        id: event.event_id,
        agentId: payload.agent_id,
        role: payload.role,
        text: payload.summary,
        done: false,
        reasoning: null,
      });
      continue;
    }
    if (event.kind === 'agent.handoff') {
      lines.push({
        id: event.event_id,
        agentId: payload.to_agent_id ?? payload.agent_id,
        role: payload.role,
        text: payload.summary ?? 'Handed the work on.',
        done: false,
        reasoning: null,
      });
      continue;
    }
    if (event.kind === 'agent.completed') {
      // Close out this agent's open lines rather than adding another. The
      // reasoning (if any) belongs on the most recent of them, not repeated
      // across every line this agent wrote.
      let reasoningAssigned = false;
      for (let index = lines.length - 1; index >= 0; index -= 1) {
        if (lines[index].agentId === payload.agent_id) {
          lines[index] = {
            ...lines[index],
            done: true,
            reasoning:
              !reasoningAssigned && payload.reasoning
                ? payload.reasoning
                : lines[index].reasoning,
          };
          reasoningAssigned = true;
        }
      }
      // No open line to close -- this agent never had a `started` line on
      // this feed (a resumed stream, or one that dropped it). Its completion
      // still deserves a line rather than vanishing silently.
      if (!reasoningAssigned) {
        lines.push({
          id: event.event_id,
          agentId: payload.agent_id,
          role: payload.role,
          text: payload.summary ?? 'Completed.',
          done: true,
          reasoning: payload.reasoning,
        });
      }
    }
  }

  return lines;
};

export const AgentProgress = ({
  events,
  status,
  agents,
}: {
  readonly events: readonly ThreadEvent[];
  readonly status: FeedStatus;
  readonly agents: readonly Agent[];
}) => {
  const lines = progressLines(events);
  if (lines.length === 0 && status !== 'reconnecting') return null;

  const nameOf = (agentId: string | null) =>
    agents.find((agent) => agent.agent_id === agentId)?.display_name ?? agentId;

  // Prefers the roster's own role over the event payload's: `agent.handoff`
  // carries the *sending* agent's role in `payload.role`, but the line is
  // attributed to the receiver (`to_agent_id`) -- looking the receiver up in
  // the roster gets its icon right even there. Falls back to the payload's
  // role only when the agent isn't in the roster at all.
  const roleOf = (agentId: string | null, fallbackRole: string | null) =>
    agents.find((agent) => agent.agent_id === agentId)?.role ?? fallbackRole;

  return (
    <section
      className="rounded-sm border border-border px-4 py-3"
      aria-live="polite"
      aria-label="Agent progress"
    >
      {status === 'reconnecting' ? (
        <Badge intent="warning" size="sm">
          Reconnecting to the work feed
        </Badge>
      ) : null}

      <ol className="m-0 flex list-none flex-col gap-2 p-0 overflow-hidden">
        <AnimatePresence initial={false}>
          {lines.map((line) => (
            <motion.li
              key={line.id}
              layout
              initial={{ opacity: 0, height: 0, scale: 0.95 }}
              animate={{ opacity: 1, height: 'auto', scale: 1 }}
              exit={{ opacity: 0, height: 0, scale: 0.95 }}
              transition={{ type: 'spring', stiffness: 400, damping: 30 }}
              className="flex items-start gap-3 overflow-hidden py-1"
            >
              <span
                className={
                  line.done
                    ? 'mt-1 text-foreground-muted transition-colors duration-500'
                    : 'mt-1 text-primary'
                }
                aria-hidden="true"
              >
                <motion.div
                  animate={line.done ? {} : { scale: [1, 1.15, 1], opacity: [0.7, 1, 0.7] }}
                  transition={line.done ? {} : { repeat: Infinity, duration: 1.5, ease: 'easeInOut' }}
                >
                  <Icon
                    name={ROLE_ICON[roleOf(line.agentId, line.role) ?? ''] ?? DEFAULT_ROLE_ICON}
                    size="sm"
                  />
                </motion.div>
              </span>
              <span className={`min-w-0 flex-1 text-sm transition-colors duration-500 ${line.done ? 'text-foreground-muted' : 'text-foreground'}`}>
                {line.agentId ? (
                  <strong className="mr-2 font-mono text-[10px] uppercase tracking-[0.14em] text-foreground">
                    {nameOf(line.agentId)}
                  </strong>
                ) : null}
                {line.done ? (
                  line.text
                ) : (
                  <motion.span
                    animate={{ opacity: [0.5, 1, 0.5] }}
                    transition={{ repeat: Infinity, duration: 2, ease: 'easeInOut' }}
                  >
                    {line.text}
                  </motion.span>
                )}
                {line.reasoning ? (
                  <span className="mt-0.5 block text-xs italic text-foreground-muted">
                    {line.reasoning}
                  </span>
                ) : null}
              </span>
            </motion.li>
          ))}
        </AnimatePresence>
      </ol>
    </section>
  );
};
