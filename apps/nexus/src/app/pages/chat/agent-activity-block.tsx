/**
 * One turn's cross-agent activity, inline in the timeline.
 *
 * `agent-progress.tsx` already reduces the Work Feed to the lines worth
 * showing -- this only regroups those lines per turn (one collapsible block
 * per Analysis Run rather than one continuous rail) and adds the two things a
 * grouped view needs that a single stream did not: a stable color per agent,
 * so a reader can tell two agents apart at a glance, and an expand/collapse
 * lifecycle tied to whether the turn is still in flight.
 */

import { useEffect, useRef, useState } from 'react';

import { AnimatePresence, motion } from 'framer-motion';

import { Icon } from '@open-zentra/foundation-icons';

import type { Agent, ThreadEvent } from '../../types';
import { DEFAULT_ROLE_ICON, ROLE_ICON, progressLines } from './agent-progress';

/**
 * Buckets Work Feed events by the Analysis Run they belong to.
 *
 * `AgentEventPayload` carries no `analysis_run_id` of its own -- an agent
 * event is attributed to whichever Analysis Run's id most recently appeared
 * on the feed (`analysis_run.*`, `finding.published`, `visualization.*` all
 * carry one). That is the same positional reasoning `to-chat-message.ts` uses
 * to pair an answer with its question: nothing is inferred that the feed does
 * not itself imply by ordering.
 */
export const groupEventsByAnalysisRun = (
  events: readonly ThreadEvent[],
): ReadonlyMap<string, readonly ThreadEvent[]> => {
  const groups = new Map<string, ThreadEvent[]>();
  let currentRunId: string | null = null;

  for (const event of events) {
    const runId = 'analysis_run_id' in event.payload ? event.payload.analysis_run_id : null;
    if (runId) currentRunId = runId;
    if (!currentRunId) continue;

    const bucket = groups.get(currentRunId) ?? [];
    bucket.push(event);
    groups.set(currentRunId, bucket);
  }

  return groups;
};

/**
 * A stable hue per agent (keyed by `agentId`, falling back to `role`), so the
 * same agent reads as the same color everywhere in the block and two
 * concurrently-active agents land on visibly different ones. No palette to
 * run out of: any key hashes to a hue on the wheel.
 */
const hueFor = (key: string): number => {
  let hash = 0;
  for (let index = 0; index < key.length; index += 1) {
    hash = (hash * 31 + key.charCodeAt(index)) % 360;
  }
  return hash < 0 ? hash + 360 : hash;
};

const colorFor = (key: string): string => `hsl(${hueFor(key)}deg 68% 46%)`;

interface AgentActivityBlockProps {
  /** This turn's Work Feed events only -- see `groupEventsByAnalysisRun`. */
  readonly events: readonly ThreadEvent[];
  readonly agents: readonly Agent[];
  /** Whether the turn's Message/answer has settled into a terminal state. */
  readonly finalized: boolean;
}

/**
 * Expanded while the turn is still in flight, collapsing to a one-line
 * summary the instant it finalizes -- and freely re-toggleable by hand from
 * then on, for both a turn that just finished and one loaded from history.
 */
export const AgentActivityBlock = ({ events, agents, finalized }: AgentActivityBlockProps) => {
  const lines = progressLines(events);
  const [expanded, setExpanded] = useState(!finalized);
  const wasFinalized = useRef(finalized);

  useEffect(() => {
    if (finalized && !wasFinalized.current) setExpanded(false);
    wasFinalized.current = finalized;
  }, [finalized]);

  if (lines.length === 0) return null;

  const nameOf = (agentId: string | null) =>
    agents.find((agent) => agent.agent_id === agentId)?.display_name ?? agentId ?? 'Agent';

  // Same preference as `AgentProgress`: the roster's own role over the
  // event's, so a handoff's line still gets the receiving agent's icon.
  const roleOf = (agentId: string | null, fallbackRole: string | null) =>
    agents.find((agent) => agent.agent_id === agentId)?.role ?? fallbackRole;

  const agentKeys = new Set(lines.map((line) => line.agentId ?? line.role ?? 'system'));
  const first = events[0];
  const last = events[events.length - 1];
  const seconds = Math.max(
    0,
    Math.round((Date.parse(last.occurred_at) - Date.parse(first.occurred_at)) / 1000),
  );
  const summary = `${agentKeys.size} agent${agentKeys.size === 1 ? '' : 's'} · ${seconds}s · ${
    finalized ? 'answered' : 'in progress'
  }`;

  return (
    <section
      className="my-3 rounded-sm border border-border"
      data-testid="agent-activity-block"
      aria-label="Agent activity for this turn"
    >
      <button
        type="button"
        onClick={() => setExpanded((value) => !value)}
        aria-expanded={expanded}
        className="flex w-full items-center gap-2 px-4 py-2 text-left font-mono text-[10px] uppercase tracking-[0.14em] text-foreground-muted transition-colors hover:text-foreground"
      >
        <Icon name={expanded ? 'chevron_down' : 'chevron_right'} size="sm" />
        <span data-testid="agent-activity-summary">{summary}</span>
      </button>

      <AnimatePresence initial={false}>
        {expanded ? (
          <motion.div
            key="body"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ type: 'spring', stiffness: 400, damping: 30 }}
            className="overflow-hidden border-t border-border px-4 py-3"
          >
            <ol className="m-0 flex list-none flex-col gap-2 p-0">
              <AnimatePresence initial={false}>
                {lines.map((line) => {
                  const key = line.agentId ?? line.role ?? 'system';
                  const color = colorFor(key);
                  return (
                    <motion.li
                      key={line.id}
                      layout
                      initial={{ opacity: 0, height: 0, scale: 0.95 }}
                      animate={{ opacity: 1, height: 'auto', scale: 1 }}
                      exit={{ opacity: 0, height: 0, scale: 0.95 }}
                      transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                      data-agent-key={key}
                      className="flex items-start gap-3 overflow-hidden py-1"
                    >
                      <span className="mt-1" style={{ color }} aria-hidden="true">
                        <Icon
                          name={
                            ROLE_ICON[roleOf(line.agentId, line.role) ?? ''] ?? DEFAULT_ROLE_ICON
                          }
                          size="sm"
                        />
                      </span>
                      <span className="min-w-0 flex-1 text-sm text-foreground-muted">
                        {line.agentId || line.role ? (
                          <strong
                            className="mr-2 font-mono text-[10px] uppercase tracking-[0.14em]"
                            style={{ color }}
                          >
                            {nameOf(line.agentId)}
                          </strong>
                        ) : null}
                        {line.text}
                      </span>
                    </motion.li>
                  );
                })}
              </AnimatePresence>
            </ol>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </section>
  );
};
