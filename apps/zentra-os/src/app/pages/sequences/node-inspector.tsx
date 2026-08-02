import { Alert, Drawer, Skeleton, Tabs } from '@open-zentra/foundation-design-system';
import { useQuery } from '@tanstack/react-query';

import type { TokenSource } from '../../api';

import { getPreparedTablePreview } from './api';
import type { FailedNodeData, SequenceFlowNode, StepNodeData } from './graph-layout';
import { operationFields, operationTitle } from './operation-labels';

interface NodeInspectorProps {
  readonly node: SequenceFlowNode | null;
  readonly sequenceId: string;
  readonly getToken: TokenSource;
  readonly onClose: () => void;
}

const OperationPanel = ({ step }: { readonly step: StepNodeData['step'] }) => (
  <dl className="flex flex-col gap-3">
    {operationFields(step.operation).map((field) => (
      <div key={field.label}>
        <dt className="font-mono text-[10px] font-bold uppercase tracking-[0.16em] text-foreground-muted">
          {field.label}
        </dt>
        <dd className="mt-1 text-sm">{field.value}</dd>
      </div>
    ))}
  </dl>
);

const PreviewPanel = ({
  sequenceId,
  preparedTableId,
  getToken,
}: {
  readonly sequenceId: string;
  readonly preparedTableId: string;
  readonly getToken: TokenSource;
}) => {
  const preview = useQuery({
    queryKey: ['prepared-table-preview', sequenceId, preparedTableId],
    queryFn: () => getPreparedTablePreview(getToken, sequenceId, preparedTableId),
  });

  if (preview.isPending) {
    return (
      <div className="flex flex-col gap-2">
        <Skeleton className="h-5 w-40" />
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }
  if (preview.error) {
    return (
      <Alert intent="error" role="alert" title="Preview could not be loaded">
        {preview.error.message}
      </Alert>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <dl className="grid grid-cols-2 gap-4">
        <div>
          <dt className="font-mono text-[10px] font-bold uppercase tracking-[0.16em] text-foreground-muted">
            Rows
          </dt>
          <dd className="mt-1 text-sm tabular-nums">{preview.data.row_count.toLocaleString()}</dd>
        </div>
        <div>
          <dt className="font-mono text-[10px] font-bold uppercase tracking-[0.16em] text-foreground-muted">
            Columns
          </dt>
          <dd className="mt-1 text-sm tabular-nums">{preview.data.columns.length}</dd>
        </div>
      </dl>
      <ul className="flex flex-wrap gap-1.5">
        {preview.data.columns.map((column) => (
          <li
            key={column}
            className="rounded-sm border border-border bg-background-muted px-2 py-0.5 font-mono text-xs"
          >
            {column}
          </li>
        ))}
      </ul>
      <p className="text-xs text-foreground-muted">
        Sample rows are not shown — Sequence previews are limited to what Data
        Steward itself may read.
      </p>
    </div>
  );
};

/**
 * Read-only inspection for a clicked node.
 *
 * A Raw Table node has nothing more to show than its label, already visible
 * on the canvas, so it does not open this at all — see `sequence-canvas.tsx`.
 */
export const NodeInspector = ({ node, sequenceId, getToken, onClose }: NodeInspectorProps) => {
  const open = node !== null && node.data.kind !== 'raw';

  return (
    <Drawer
      direction="right"
      size="1/3"
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <Drawer.Content>
        {node && node.data.kind === 'failed' ? (
          <>
            <Drawer.Header>
              <Drawer.Title>Failed Sequence Step</Drawer.Title>
              <Drawer.Close />
            </Drawer.Header>
            <Drawer.Body>
              <p className="text-sm">{(node.data as FailedNodeData).run.failure_detail}</p>
            </Drawer.Body>
          </>
        ) : null}

        {node && (node.data.kind === 'step' || node.data.kind === 'final') ? (
          <>
            <Drawer.Header>
              <Drawer.Title>{operationTitle((node.data as StepNodeData).step.operation)}</Drawer.Title>
              <Drawer.Description>
                {(node.data as StepNodeData).table.is_final ? 'Final Table' : 'Prepared Table'}
              </Drawer.Description>
              <Drawer.Close />
            </Drawer.Header>
            <Drawer.Body>
              <Tabs defaultValue="operation">
                <Tabs.List>
                  <Tabs.Trigger value="operation">Operation</Tabs.Trigger>
                  <Tabs.Trigger value="preview">Preview</Tabs.Trigger>
                </Tabs.List>
                <Tabs.Content value="operation">
                  <OperationPanel step={(node.data as StepNodeData).step} />
                </Tabs.Content>
                <Tabs.Content value="preview">
                  <PreviewPanel
                    sequenceId={sequenceId}
                    preparedTableId={(node.data as StepNodeData).table.prepared_table_id}
                    getToken={getToken}
                  />
                </Tabs.Content>
              </Tabs>
            </Drawer.Body>
          </>
        ) : null}
      </Drawer.Content>
    </Drawer>
  );
};
