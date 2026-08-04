import { Handle, Position, type NodeProps } from '@xyflow/react';

import { Badge } from '@open-zentra/foundation-design-system';
import { Icon } from '@open-zentra/foundation-icons';

import type { SequenceFlowNode, StepNodeData } from '../graph-layout';
import { operationTitle } from '../operation-labels';
import { HANDLE_CLASSES, NODE_CARD_CLASSES } from './node-styles';

/** Covers both the `step` and `final` node kinds — Final Table is a visual
 * variant of the same merged Step+Prepared-Table node, not a separate one. */
export const StepNode = ({ data }: NodeProps<SequenceFlowNode>) => {
  const { kind, step, table } = data as StepNodeData;
  const isFinal = kind === 'final';

  return (
    <div className={`w-56 rounded-sm border px-4 py-3 shadow-sm ${NODE_CARD_CLASSES[kind]}`}>
      <Handle type="target" position={Position.Left} className={HANDLE_CLASSES} />
      <div className="flex items-center justify-between gap-2">
        <p className="font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-foreground-muted">
          Sequence Step
        </p>
        {isFinal ? (
          <Badge intent="primary" size="sm">
            Final
          </Badge>
        ) : null}
      </div>
      <p className="mt-2 flex items-center gap-1.5 truncate text-sm font-medium">
        <Icon name="wrench" size="sm" className="shrink-0 text-foreground-muted" />
        {operationTitle(step.operation)}
      </p>
      <p className="mt-1 font-mono text-[10px] text-foreground-muted">
        {table.row_count.toLocaleString()} rows · {table.columns.length} columns
      </p>
      <Handle type="source" position={Position.Right} className={HANDLE_CLASSES} />
    </div>
  );
};
