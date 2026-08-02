import { Handle, Position, type NodeProps } from '@xyflow/react';

import { Icon } from '@open-zentra/foundation-icons';

import type { RawNodeData, SequenceFlowNode } from '../graph-layout';
import { HANDLE_CLASSES, NODE_CARD_CLASSES } from './node-styles';

export const RawTableNode = ({ data }: NodeProps<SequenceFlowNode>) => {
  const { label } = data as RawNodeData;
  return (
    <div
      className={`w-56 rounded-sm border px-4 py-3 shadow-sm ${NODE_CARD_CLASSES.raw}`}
    >
      <div className="flex items-center gap-2">
        <Icon name="database" size="sm" className="shrink-0 text-foreground-muted" />
        <p className="font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-foreground-muted">
          Raw Table
        </p>
      </div>
      <p className="mt-2 truncate text-sm font-medium">{label}</p>
      <Handle type="source" position={Position.Right} className={HANDLE_CLASSES} />
    </div>
  );
};
