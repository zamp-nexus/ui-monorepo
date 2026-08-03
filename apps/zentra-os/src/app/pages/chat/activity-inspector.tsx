import { IconButton } from '@open-zentra/foundation-design-system';
import { Icon } from '@open-zentra/foundation-icons';

import type { Agent, ThreadEvent } from '../../types';
import { AgentProgress } from './agent-progress';
import { useResizablePanel } from './use-resizable-panel';
import type { FeedStatus } from './use-thread-events';

const DEFAULT_WIDTH = 360;
const MIN_WIDTH = 280;
const MIN_CHAT_WIDTH = 480;

interface ActivityInspectorProps {
  readonly events: readonly ThreadEvent[];
  readonly status: FeedStatus;
  readonly agents: readonly Agent[];
  readonly open: boolean;
  readonly onClose: () => void;
}

/**
 * Everything the Activity Feed carries, hidden by default (ADR-0029).
 *
 * Desktop: a resizable right panel, minimum width enforced on both itself
 * and the remaining chat area so neither can be dragged to nothing. Mobile:
 * a bottom drawer at a fixed height -- resizing a drawer by dragging its top
 * edge is a worse interaction than just giving it a sensible fixed height on
 * a screen too narrow to resize meaningfully anyway.
 *
 * A pending Human Approval is the one exception ADR-0029 calls for and stays
 * inline in the conversation (`InvestigationControls`) -- this panel never
 * renders it.
 */
export const ActivityInspector = ({
  events,
  status,
  agents,
  open,
  onClose,
}: ActivityInspectorProps) => {
  const { width, onDragStart } = useResizablePanel({
    defaultWidth: DEFAULT_WIDTH,
    minWidth: MIN_WIDTH,
    minRemainingWidth: MIN_CHAT_WIDTH,
  });

  if (!open) return null;

  return (
    <>
      <div
        className="hidden h-full shrink-0 flex-row border-l border-border bg-card md:flex"
        style={{ width }}
      >
        <div
          className="w-1 shrink-0 cursor-col-resize self-stretch hover:bg-primary/20"
          onPointerDown={onDragStart}
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize the activity panel"
        />
        <div className="flex min-w-0 flex-1 flex-col">
          <InspectorHeader onClose={onClose} />
          <div className="min-h-0 flex-1 overflow-y-auto p-4">
            <AgentProgress events={events} status={status} agents={agents} />
          </div>
        </div>
      </div>

      <div className="fixed inset-x-0 bottom-0 z-20 flex h-[60vh] flex-col border-t border-border bg-card md:hidden">
        <InspectorHeader onClose={onClose} />
        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          <AgentProgress events={events} status={status} agents={agents} />
        </div>
      </div>
    </>
  );
};

const InspectorHeader = ({ onClose }: { readonly onClose: () => void }) => (
  <div className="flex items-center justify-between border-b border-border px-4 py-3">
    <h2 className="font-mono text-[10px] uppercase tracking-[0.14em] text-foreground-muted">
      Activity
    </h2>
    <IconButton aria-label="Close activity panel" intent="ghost" size="sm" onClick={onClose}>
      <Icon name="x" size="sm" />
    </IconButton>
  </div>
);
