import { Handle, Position, type NodeProps } from '@xyflow/react';

import { Icon } from '@open-zentra/foundation-icons';

import type { FailedNodeData, SequenceFlowNode } from '../graph-layout';
import { HANDLE_CLASSES, NODE_CARD_CLASSES } from './node-styles';

const FAILURE_REASON_LABEL: Record<string, string> = {
  catalog_violation: 'Not a valid operation',
  data_incompatible: 'Data was incompatible',
  unknown_table: 'Unknown table',
  execution_error: 'Execution error',
};

/** A failed or blocked Sequence Step, rendered — not hidden, not silently
 * dropped — as its own node kind, per the PRD's failed-step requirement. */
export const FailedStepNode = ({ data }: NodeProps<SequenceFlowNode>) => {
  const { run } = data as FailedNodeData;
  return (
    <div
      className={`w-56 rounded-sm border px-4 py-3 shadow-sm ${NODE_CARD_CLASSES.failed}`}
    >
      <Handle type="target" position={Position.Left} className={HANDLE_CLASSES} />
      <div className="flex items-center gap-2">
        <Icon name="alert_triangle" size="sm" className="shrink-0 text-danger" />
        <p className="font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-danger">
          Failed
        </p>
      </div>
      <p className="mt-2 truncate text-sm font-medium">
        {FAILURE_REASON_LABEL[run.failure_reason] ?? run.failure_reason}
      </p>
      <p className="mt-1 line-clamp-2 text-xs text-foreground-muted">{run.failure_detail}</p>
    </div>
  );
};
