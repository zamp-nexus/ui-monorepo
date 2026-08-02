/// <reference types="vitest/globals" />
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

import { SequenceDetailPage } from './sequence-detail-page';
import type { SequenceGraph } from './types';

const getToken = async () => 'test-token';

const SEQUENCE_ID = '30000000-0000-0000-0000-000000000003';
const THREAD_ID = '31000000-0000-0000-0000-000000000004';

const RAW_TABLE = { kind: 'connector_source_table' as const, label: 'clickathon.orders' };

const linearGraph = (): SequenceGraph => ({
  sequence_id: SEQUENCE_ID,
  dataset_workspace_id: 'ws-1',
  thread_id: THREAD_ID,
  origin: 'manual',
  raw_table: RAW_TABLE,
  created_at: '2026-08-01T09:00:00Z',
  updated_at: '2026-08-01T09:05:00Z',
  steps: [
    {
      step_id: 's1',
      operation: { kind: 'drop_nulls', parameters: { columns: ['email'], strategy: 'any' } },
      input_prepared_table_id: null,
      produced_table_id: 't1',
      created_at: '2026-08-01T09:01:00Z',
    },
  ],
  prepared_tables: [
    {
      prepared_table_id: 't1',
      step_id: 's1',
      parent_prepared_table_id: null,
      row_count: 42,
      columns: ['id', 'email'],
      created_at: '2026-08-01T09:01:00Z',
      is_final: true,
    },
  ],
  failed_runs: [],
});

const branchingGraph = (): SequenceGraph => {
  const base = linearGraph();
  return {
    ...base,
    prepared_tables: [
      { ...base.prepared_tables[0], is_final: false },
      {
        prepared_table_id: 't2a',
        step_id: 's2a',
        parent_prepared_table_id: 't1',
        row_count: 20,
        columns: ['id', 'email'],
        created_at: '2026-08-01T09:02:00Z',
        is_final: true,
      },
      {
        prepared_table_id: 't2b',
        step_id: 's2b',
        parent_prepared_table_id: 't1',
        row_count: 22,
        columns: ['id', 'email'],
        created_at: '2026-08-01T09:03:00Z',
        is_final: true,
      },
    ],
    steps: [
      base.steps[0],
      {
        step_id: 's2a',
        operation: { kind: 'dedupe', parameters: {} },
        input_prepared_table_id: 't1',
        produced_table_id: 't2a',
        created_at: '2026-08-01T09:02:00Z',
      },
      {
        step_id: 's2b',
        operation: { kind: 'rename_column', parameters: { from_name: 'id', to_name: 'order_id' } },
        input_prepared_table_id: 't1',
        produced_table_id: 't2b',
        created_at: '2026-08-01T09:03:00Z',
      },
    ],
  };
};

const failedGraph = (): SequenceGraph => ({
  ...linearGraph(),
  failed_runs: [
    {
      run_id: 'r1',
      attempted_at: '2026-08-01T09:04:00Z',
      failure_reason: 'data_incompatible',
      failure_detail: 'Column "amount" could not be cast to int.',
      anchor_prepared_table_id: 't1',
    },
  ],
});

const THREAD = {
  thread_id: THREAD_ID,
  project_id: 'p1',
  title: 'Clean up orders',
  status: 'active',
  created_at: '2026-08-01T09:00:00Z',
  updated_at: '2026-08-01T09:00:00Z',
  latest_activity_at: '2026-08-01T09:00:00Z',
  messages: [
    {
      message_id: 'm1',
      thread_id: THREAD_ID,
      authored_by_user: true,
      kind: 'user_question',
      content: 'Drop rows with a missing email.',
      created_at: '2026-08-01T09:00:00Z',
    },
  ],
  investigation_id: null,
  investigations: [],
  event_cursor: 0,
  usage: { input_tokens: 0, output_tokens: 0, cost_usd: '0' },
  routing: null,
  actions: { can_append_message: true },
};

/** Answer each endpoint by URL, so ordering between them cannot matter. */
const route = (
  graph: SequenceGraph,
  overrides: Record<string, { status?: number; body: unknown }> = {},
) =>
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
    const url = String(input);
    if (url.includes('/events')) {
      // No frames: an idle stream that just ends, since the live-growth test
      // drives this separately.
      return {
        ok: true,
        status: 200,
        body: { getReader: () => ({ read: async () => ({ done: true, value: undefined }) }) },
      } as unknown as Response;
    }
    if (url.includes('/prepared-tables/')) {
      const preparedTableId = url.split('/prepared-tables/')[1];
      const table = graph.prepared_tables.find((t) => t.prepared_table_id === preparedTableId);
      const step = graph.steps.find((s) => s.step_id === table?.step_id);
      return {
        ok: true,
        status: 200,
        json: async () => ({
          prepared_table_id: table?.prepared_table_id,
          step_id: table?.step_id,
          row_count: table?.row_count,
          columns: table?.columns,
          is_final: table?.is_final,
          created_at: table?.created_at,
          produced_by: step?.operation,
          sample_rows: null,
        }),
      } as Response;
    }
    if (url.includes(`/v1/sequences/${SEQUENCE_ID}`)) {
      return { ok: true, status: 200, json: async () => graph } as Response;
    }
    if (url.includes(`/v1/threads/${THREAD_ID}`)) {
      return { ok: true, status: 200, json: async () => THREAD } as Response;
    }
    const key = Object.keys(overrides).find((fragment) => url.includes(fragment));
    if (key) {
      const handler = overrides[key];
      return {
        ok: (handler.status ?? 200) < 400,
        status: handler.status ?? 200,
        json: async () => handler.body,
      } as Response;
    }
    throw new Error(`unhandled request: ${url}`);
  });

const renderDetail = () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <MemoryRouter initialEntries={[`/sequences/${SEQUENCE_ID}`]}>
      <QueryClientProvider client={queryClient}>
        <Routes>
          <Route
            path="/sequences/:sequenceId"
            element={<SequenceDetailPage getToken={getToken} identity={undefined as never} />}
          />
        </Routes>
      </QueryClientProvider>
    </MemoryRouter>,
  );
};

beforeEach(() => {
  vi.restoreAllMocks();
  // jsdom has no layout engine and does not implement scrollIntoView.
  Element.prototype.scrollIntoView = () => undefined;
});

describe('SequenceDetailPage', () => {
  it('renders the raw table, each step, and the final table', async () => {
    route(linearGraph());

    renderDetail();

    expect(await screen.findByRole('heading', { name: 'clickathon.orders' })).toBeTruthy();
    expect(await screen.findByText('Drop nulls')).toBeTruthy();
    expect(screen.getByText('Final')).toBeTruthy();
  });

  it('renders a branch with two final tables', async () => {
    route(branchingGraph());

    renderDetail();

    expect(await screen.findByText('Dedupe')).toBeTruthy();
    expect(screen.getByText('Rename column')).toBeTruthy();
    expect(screen.getAllByText('Final')).toHaveLength(2);
  });

  it('shows a failed attempt where it happened', async () => {
    route(failedGraph());

    renderDetail();

    expect(await screen.findByText('Data was incompatible')).toBeTruthy();
  });

  it("explains a step's typed operation on click", async () => {
    route(linearGraph());

    renderDetail();
    fireEvent.click(await screen.findByText('Drop nulls'));

    const dialog = await screen.findByRole('dialog');
    expect(dialog.textContent).toContain('email');
    expect(dialog.textContent).toContain('any');
  });

  it('previews a prepared table on click', async () => {
    route(linearGraph());

    renderDetail();
    fireEvent.click(await screen.findByText('Drop nulls'));
    fireEvent.click(await screen.findByRole('tab', { name: /preview/i }));

    expect(await screen.findByText('42')).toBeTruthy();
    expect(screen.getByText('email')).toBeTruthy();
    expect(screen.getByText(/sample rows are not shown/i)).toBeTruthy();
  });

  it('grows the graph when the thread reports work, without remounting', async () => {
    const oneStep = linearGraph();
    const twoSteps: SequenceGraph = {
      ...oneStep,
      prepared_tables: [
        oneStep.prepared_tables[0],
        {
          prepared_table_id: 't2',
          step_id: 's2',
          parent_prepared_table_id: 't1',
          row_count: 10,
          columns: ['id'],
          created_at: '2026-08-01T09:06:00Z',
          is_final: true,
        },
      ],
      steps: [
        { ...oneStep.steps[0] },
        {
          step_id: 's2',
          operation: { kind: 'dedupe', parameters: {} },
          input_prepared_table_id: 't1',
          produced_table_id: 't2',
          created_at: '2026-08-01T09:06:00Z',
        },
      ],
    };
    // The first Prepared Table is no longer final once the second exists.
    twoSteps.prepared_tables[0] = { ...twoSteps.prepared_tables[0], is_final: false };

    let servedGraph = oneStep;
    let resolveEventStream: ((chunk: { done: boolean; value?: Uint8Array }) => void) | null = null;

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes('/events')) {
        return {
          ok: true,
          status: 200,
          body: {
            getReader: () => ({
              read: () =>
                new Promise((resolve) => {
                  resolveEventStream = resolve;
                }),
            }),
          },
        } as unknown as Response;
      }
      if (url.includes(`/v1/sequences/${SEQUENCE_ID}`)) {
        return { ok: true, status: 200, json: async () => servedGraph } as Response;
      }
      if (url.includes(`/v1/threads/${THREAD_ID}`)) {
        return { ok: true, status: 200, json: async () => THREAD } as Response;
      }
      throw new Error(`unhandled request: ${url}`);
    });

    renderDetail();
    expect(await screen.findByText('Drop nulls')).toBeTruthy();
    const firstNodeElement = screen.getByText('Drop nulls');

    servedGraph = twoSteps;
    const frame =
      'id: 1\nevent: thread.message_added\ndata: ' +
      JSON.stringify({
        event_id: 'e1',
        tenant_id: 't',
        thread_id: THREAD_ID,
        sequence: 1,
        kind: 'thread.message_added',
        occurred_at: '2026-08-01T09:06:00Z',
        payload: { type: 'message', message_id: 'm2', message_kind: 'user_question' },
      }) +
      '\n\n';
    await waitFor(() => expect(resolveEventStream).toBeTruthy());
    resolveEventStream?.({ done: false, value: new TextEncoder().encode(frame) });

    expect(await screen.findByText('Dedupe')).toBeTruthy();
    // Reconciled by node id, not remounted — the first node's element
    // identity survives the refetch.
    expect(screen.getByText('Drop nulls')).toBe(firstNodeElement);
  });
});
