/**
 * Turning a persisted Sequence graph into React Flow nodes and edges.
 *
 * The API never emits coordinates — a Sequence's persisted state is Raw
 * Table + Sequence Steps + Prepared Tables + failed Sequence Runs, nothing
 * about where to draw them. Layout is a client concern, computed
 * deterministically here so the same graph always renders the same way and
 * this function can be unit-tested with no DOM.
 *
 * Node model: a Sequence Step is merged with the one Prepared Table it
 * produced into a single node — every step produces exactly one table and
 * every table has exactly one producing step, so a separate node for each
 * would double the node/edge count for no extra information. Final Table is
 * a variant of that same node, not a different one.
 */

import type { Edge, Node } from '@xyflow/react';

import type { FailedRun, PreparedTable, SequenceGraph, SequenceStep } from './types';

const COLUMN_GAP = 280;
const ROW_GAP = 140;

export type SequenceNodeKind = 'raw' | 'step' | 'final' | 'failed';

export interface RawNodeData extends Record<string, unknown> {
  readonly kind: 'raw';
  readonly label: string;
}

export interface StepNodeData extends Record<string, unknown> {
  readonly kind: 'step' | 'final';
  readonly step: SequenceStep;
  readonly table: PreparedTable;
}

export interface FailedNodeData extends Record<string, unknown> {
  readonly kind: 'failed';
  readonly run: FailedRun;
}

export type SequenceNodeData = RawNodeData | StepNodeData | FailedNodeData;
export type SequenceFlowNode = Node<SequenceNodeData, SequenceNodeKind>;
export type SequenceFlowEdge = Edge;

export interface SequenceFlowGraph {
  readonly nodes: readonly SequenceFlowNode[];
  readonly edges: readonly SequenceFlowEdge[];
}

const RAW_NODE_ID = 'raw';

interface PositionedEntry {
  readonly id: string;
  readonly timestamp: number;
}

/** Depth 0 is the Raw Table; every Prepared Table is one more than its parent
 * (or the Raw Table, when it has none). */
const depthsByPreparedTable = (
  preparedTables: readonly PreparedTable[],
): Map<string, number> => {
  const byId = new Map(preparedTables.map((table) => [table.prepared_table_id, table]));
  const depths = new Map<string, number>();

  const depthOf = (tableId: string): number => {
    const cached = depths.get(tableId);
    if (cached !== undefined) return cached;
    const table = byId.get(tableId);
    if (!table) return 0;
    const parentDepth = table.parent_prepared_table_id
      ? depthOf(table.parent_prepared_table_id)
      : 0;
    const depth = parentDepth + 1;
    depths.set(tableId, depth);
    return depth;
  };

  preparedTables.forEach((table) => depthOf(table.prepared_table_id));
  return depths;
};

const failedRunDepth = (
  run: FailedRun,
  tableDepths: Map<string, number>,
): number => (run.anchor_prepared_table_id ? (tableDepths.get(run.anchor_prepared_table_id) ?? 0) + 1 : 1);

/** Groups entries by depth, then assigns a centred y within each depth band,
 * ordered by timestamp (then id) for a stable, deterministic layout. */
const assignPositions = (
  byDepth: Map<number, PositionedEntry[]>,
): Map<string, { x: number; y: number }> => {
  const positions = new Map<string, { x: number; y: number }>();
  for (const [depth, entries] of byDepth) {
    const ordered = [...entries].sort(
      (a, b) => a.timestamp - b.timestamp || a.id.localeCompare(b.id),
    );
    const offset = ((ordered.length - 1) * ROW_GAP) / 2;
    ordered.forEach((entry, index) => {
      positions.set(entry.id, {
        x: depth * COLUMN_GAP,
        y: index * ROW_GAP - offset,
      });
    });
  }
  return positions;
};

export const layoutSequenceGraph = (graph: SequenceGraph): SequenceFlowGraph => {
  const tableDepths = depthsByPreparedTable(graph.prepared_tables);
  const stepByProducedTable = new Map(
    graph.steps.map((step) => [step.produced_table_id, step]),
  );
  const finalTableIds = new Set(
    graph.prepared_tables.filter((table) => table.is_final).map((table) => table.prepared_table_id),
  );

  const byDepth = new Map<number, PositionedEntry[]>();
  const pushEntry = (depth: number, id: string, timestamp: string) => {
    const entries = byDepth.get(depth) ?? [];
    entries.push({ id, timestamp: new Date(timestamp).getTime() });
    byDepth.set(depth, entries);
  };

  for (const table of graph.prepared_tables) {
    pushEntry(tableDepths.get(table.prepared_table_id) ?? 1, table.prepared_table_id, table.created_at);
  }
  for (const run of graph.failed_runs) {
    pushEntry(failedRunDepth(run, tableDepths), run.run_id, run.attempted_at);
  }

  const positions = assignPositions(byDepth);
  positions.set(RAW_NODE_ID, { x: 0, y: 0 });

  const nodes: SequenceFlowNode[] = [
    {
      id: RAW_NODE_ID,
      type: 'raw',
      position: positions.get(RAW_NODE_ID) ?? { x: 0, y: 0 },
      data: { kind: 'raw', label: graph.raw_table.label },
    },
    ...graph.prepared_tables.map((table): SequenceFlowNode => {
      const step = stepByProducedTable.get(table.prepared_table_id);
      const isFinal = finalTableIds.has(table.prepared_table_id);
      // Every Prepared Table has exactly one producing Sequence Step by
      // construction (`Sequence.append_step` writes both atomically); a
      // missing step here would mean the API returned an inconsistent graph.
      if (!step) {
        throw new Error(`Prepared Table ${table.prepared_table_id} has no producing step`);
      }
      return {
        id: table.prepared_table_id,
        type: isFinal ? 'final' : 'step',
        position: positions.get(table.prepared_table_id) ?? { x: 0, y: 0 },
        data: { kind: isFinal ? 'final' : 'step', step, table },
      };
    }),
    ...graph.failed_runs.map(
      (run): SequenceFlowNode => ({
        id: run.run_id,
        type: 'failed',
        position: positions.get(run.run_id) ?? { x: 0, y: 0 },
        data: { kind: 'failed', run },
      }),
    ),
  ];

  const edges: SequenceFlowEdge[] = [
    ...graph.prepared_tables.map((table) => ({
      id: `${table.parent_prepared_table_id ?? RAW_NODE_ID}->${table.prepared_table_id}`,
      source: table.parent_prepared_table_id ?? RAW_NODE_ID,
      target: table.prepared_table_id,
    })),
    ...graph.failed_runs.map((run) => ({
      id: `${run.anchor_prepared_table_id ?? RAW_NODE_ID}->${run.run_id}`,
      source: run.anchor_prepared_table_id ?? RAW_NODE_ID,
      target: run.run_id,
      animated: false,
      style: { strokeDasharray: '4 4' },
    })),
  ];

  return { nodes, edges };
};
