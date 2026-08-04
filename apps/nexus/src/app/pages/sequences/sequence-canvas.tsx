import { useMemo } from 'react';

import { Background, BackgroundVariant, Controls, ReactFlow, type NodeTypes } from '@xyflow/react';

import '@xyflow/react/dist/style.css';

import { layoutSequenceGraph, type SequenceFlowNode } from './graph-layout';
import { FailedStepNode } from './nodes/failed-step-node';
import { RawTableNode } from './nodes/raw-table-node';
import { StepNode } from './nodes/step-node';
import type { SequenceGraph } from './types';

const NODE_TYPES: NodeTypes = {
  raw: RawTableNode,
  step: StepNode,
  final: StepNode,
  failed: FailedStepNode,
};

interface SequenceCanvasProps {
  readonly graph: SequenceGraph;
  readonly onNodeClick: (node: SequenceFlowNode) => void;
}

/**
 * The Sequence's lineage as a read-only, pannable/zoomable graph.
 *
 * Read-plus-chat-driven-write only, per the PRD: nothing here lets a reader
 * move, connect, or delete a node — the canvas is a view of persisted state,
 * never an editor of it.
 */
export const SequenceCanvas = ({ graph, onNodeClick }: SequenceCanvasProps) => {
  const { nodes, edges } = useMemo(() => layoutSequenceGraph(graph), [graph]);

  return (
    <ReactFlow
      nodes={[...nodes]}
      edges={[...edges]}
      nodeTypes={NODE_TYPES}
      onNodeClick={(_event, node) => onNodeClick(node as SequenceFlowNode)}
      nodesDraggable={false}
      nodesConnectable={false}
      edgesFocusable={false}
      elementsSelectable
      deleteKeyCode={null}
      panOnDrag
      zoomOnScroll
      fitView
      minZoom={0.3}
      maxZoom={1.75}
      proOptions={{ hideAttribution: true }}
    >
      <Background variant={BackgroundVariant.Dots} />
      <Controls showInteractive={false} />
    </ReactFlow>
  );
};
