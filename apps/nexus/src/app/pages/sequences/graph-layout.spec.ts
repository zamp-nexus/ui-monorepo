/// <reference types="vitest/globals" />
import { layoutSequenceGraph, type StepNodeData } from './graph-layout';
import type { FailedRun, PreparedTable, SequenceGraph, SequenceStep } from './types';

const BASE = '2026-08-01T09:00:00Z';
const at = (minutes: number) => new Date(Date.parse(BASE) + minutes * 60_000).toISOString();

const step = (
  overrides: Partial<SequenceStep> & { step_id: string; produced_table_id: string },
): SequenceStep => ({
  operation: { kind: 'drop_nulls', parameters: { columns: ['email'] } },
  input_prepared_table_id: null,
  created_at: BASE,
  ...overrides,
});

const table = (
  overrides: Partial<PreparedTable> & { prepared_table_id: string; step_id: string },
): PreparedTable => ({
  parent_prepared_table_id: null,
  row_count: 10,
  columns: ['id'],
  created_at: BASE,
  is_final: false,
  ...overrides,
});

const graph = (overrides: Partial<SequenceGraph> = {}): SequenceGraph => ({
  sequence_id: 'seq-1',
  dataset_workspace_id: 'ws-1',
  thread_id: null,
  origin: 'manual',
  raw_table: { kind: 'connector_source_table', label: 'clickathon.orders' },
  created_at: BASE,
  updated_at: BASE,
  steps: [],
  prepared_tables: [],
  failed_runs: [],
  ...overrides,
});

describe('layoutSequenceGraph', () => {
  it('renders just the raw node for an empty sequence', () => {
    const { nodes, edges } = layoutSequenceGraph(graph());
    expect(nodes).toHaveLength(1);
    expect(nodes[0].id).toBe('raw');
    expect(nodes[0].type).toBe('raw');
    expect(edges).toHaveLength(0);
  });

  it('places a linear chain at increasing depth, one column apart', () => {
    const result = layoutSequenceGraph(
      graph({
        steps: [
          step({ step_id: 's1', produced_table_id: 't1' }),
          step({ step_id: 's2', produced_table_id: 't2', input_prepared_table_id: 't1' }),
        ],
        prepared_tables: [
          table({ prepared_table_id: 't1', step_id: 's1', created_at: at(1) }),
          table({
            prepared_table_id: 't2',
            step_id: 's2',
            parent_prepared_table_id: 't1',
            created_at: at(2),
            is_final: true,
          }),
        ],
      }),
    );

    expect(result.nodes).toHaveLength(3);
    const byId = Object.fromEntries(result.nodes.map((n) => [n.id, n]));
    expect(byId.raw.position).toEqual({ x: 0, y: 0 });
    expect(byId.t1.position.x).toBeGreaterThan(byId.raw.position.x);
    expect(byId.t2.position.x).toBeGreaterThan(byId.t1.position.x);
    expect(byId.t1.type).toBe('step');
    expect(byId.t2.type).toBe('final');

    expect(result.edges).toContainEqual(
      expect.objectContaining({ id: 'raw->t1', source: 'raw', target: 't1' }),
    );
    expect(result.edges).toContainEqual(
      expect.objectContaining({ id: 't1->t2', source: 't1', target: 't2' }),
    );
  });

  it('spreads a branch with two final tables across the same depth', () => {
    const result = layoutSequenceGraph(
      graph({
        steps: [
          step({ step_id: 's1', produced_table_id: 't1' }),
          step({ step_id: 's2', produced_table_id: 't2a', input_prepared_table_id: 't1' }),
          step({ step_id: 's3', produced_table_id: 't2b', input_prepared_table_id: 't1' }),
        ],
        prepared_tables: [
          table({ prepared_table_id: 't1', step_id: 's1', created_at: at(1) }),
          table({
            prepared_table_id: 't2a',
            step_id: 's2',
            parent_prepared_table_id: 't1',
            created_at: at(2),
            is_final: true,
          }),
          table({
            prepared_table_id: 't2b',
            step_id: 's3',
            parent_prepared_table_id: 't1',
            created_at: at(3),
            is_final: true,
          }),
        ],
      }),
    );

    const byId = Object.fromEntries(result.nodes.map((n) => [n.id, n]));
    expect(byId.t2a.position.x).toBe(byId.t2b.position.x);
    expect(byId.t2a.position.y).not.toBe(byId.t2b.position.y);
    expect(result.edges.filter((e) => e.source === 't1')).toHaveLength(2);
  });

  it('anchors a failed run to the latest prior prepared table', () => {
    const run: FailedRun = {
      run_id: 'r1',
      attempted_at: at(5),
      failure_reason: 'data_incompatible',
      failure_detail: 'bad cast',
      anchor_prepared_table_id: 't1',
    };
    const result = layoutSequenceGraph(
      graph({
        steps: [step({ step_id: 's1', produced_table_id: 't1' })],
        prepared_tables: [table({ prepared_table_id: 't1', step_id: 's1', created_at: at(1) })],
        failed_runs: [run],
      }),
    );

    const byId = Object.fromEntries(result.nodes.map((n) => [n.id, n]));
    expect(byId.r1.type).toBe('failed');
    expect(byId.r1.position.x).toBeGreaterThan(byId.t1.position.x);
    expect(result.edges).toContainEqual(
      expect.objectContaining({ id: 't1->r1', source: 't1', target: 'r1' }),
    );
  });

  it('anchors a failed run to the raw table when nothing preceded it', () => {
    const run: FailedRun = {
      run_id: 'r1',
      attempted_at: at(1),
      failure_reason: 'unknown_table',
      failure_detail: 'no such table',
      anchor_prepared_table_id: null,
    };
    const result = layoutSequenceGraph(graph({ failed_runs: [run] }));

    expect(result.edges).toContainEqual(
      expect.objectContaining({ id: 'raw->r1', source: 'raw', target: 'r1' }),
    );
  });

  it('is deterministic for the same input', () => {
    const input = graph({
      steps: [step({ step_id: 's1', produced_table_id: 't1' })],
      prepared_tables: [table({ prepared_table_id: 't1', step_id: 's1', created_at: at(1) })],
    });
    expect(layoutSequenceGraph(input)).toEqual(layoutSequenceGraph(input));
  });

  it('carries the step and table onto a step node so the inspector can read them', () => {
    const producedStep = step({ step_id: 's1', produced_table_id: 't1' });
    const producedTable = table({ prepared_table_id: 't1', step_id: 's1' });
    const result = layoutSequenceGraph(
      graph({ steps: [producedStep], prepared_tables: [producedTable] }),
    );
    const node = result.nodes.find((n) => n.id === 't1');
    const data = node?.data as StepNodeData;
    expect(data.step).toEqual(producedStep);
    expect(data.table).toEqual(producedTable);
  });
});
