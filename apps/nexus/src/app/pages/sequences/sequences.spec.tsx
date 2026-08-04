/// <reference types="vitest/globals" />
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

import type { IdentityContext } from '../../types';
import { SequencesPage } from './sequences-page';

const getToken = async () => 'test-token';

const identity: IdentityContext = {
  user_id: '10000000-0000-0000-0000-000000000001',
  organization_id: '20000000-0000-0000-0000-000000000002',
  email: 'owner@example.com',
  organization_name: 'Acme Europe',
  role: 'owner',
};

const SEQUENCE = {
  sequence_id: '30000000-0000-0000-0000-000000000003',
  thread_id: '31000000-0000-0000-0000-000000000004',
  origin: 'manual' as const,
  raw_table: { kind: 'connector_source_table' as const, label: 'clickathon.orders' },
  step_count: 2,
  final_table_count: 1,
  failed_run_count: 0,
  created_at: '2026-08-01T09:00:00Z',
  updated_at: '2026-08-01T10:00:00Z',
};

const SOURCE = {
  data_source_id: '40000000-0000-0000-0000-000000000004',
  name: 'click-house-db',
  kind: 'connected',
  health: 'reachable',
  connection_hint: 'ixirbbg74s.ap-south-1.aws.clickhouse.cloud/clickathon',
};

const CATALOG = {
  catalog_version_id: '50000000-0000-0000-0000-000000000005',
  data_source_id: SOURCE.data_source_id,
  harvest_run_id: '60000000-0000-0000-0000-000000000006',
  created_at: '2026-08-01T20:51:00Z',
  tables: [
    {
      table_id: '70000000-0000-0000-0000-000000000007',
      name: 'orders',
      database: 'clickathon',
      agent_visible: true,
    },
  ],
  unreadable: [],
};

const GROUP_PAGE = {
  items: [{ group_id: 'g1', name: 'Workspace', archived_at: null, can_manage: true }],
  next_cursor: null,
};
const PROJECT_PAGE = {
  items: [{ project_id: 'p1', group_id: 'g1', name: 'General', archived_at: null }],
  next_cursor: null,
};

/** Answer each endpoint by URL, so ordering between them cannot matter. */
const route = (handlers: Record<string, { status?: number; body: unknown }>) =>
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url = String(input);
    const key = Object.keys(handlers).find((fragment) => url.includes(fragment));
    const handler = key ? handlers[key] : undefined;
    if (!handler) throw new Error(`unhandled request: ${url} ${init?.method ?? 'GET'}`);
    return {
      ok: (handler.status ?? 200) < 400,
      status: handler.status ?? 200,
      json: async () => handler.body,
    } as Response;
  });

const renderPage = () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <MemoryRouter>
      <QueryClientProvider client={queryClient}>
        <SequencesPage getToken={getToken} identity={identity} />
      </QueryClientProvider>
    </MemoryRouter>,
  );
};

beforeEach(() => {
  vi.restoreAllMocks();
});

describe('Sequences', () => {
  it('lists every Sequence the workspace returns', async () => {
    route({
      '/v1/sequences': { body: { dataset_workspace_id: 'ws-1', items: [SEQUENCE] } },
    });

    renderPage();

    expect(await screen.findByText('clickathon.orders')).toBeTruthy();
    expect(screen.getByText(/2 steps/)).toBeTruthy();
    expect(screen.getByText(/1 final table/)).toBeTruthy();
    expect(screen.getByText('Started here')).toBeTruthy();
  });

  it('offers a first Sequence when the workspace has none', async () => {
    route({ '/v1/sequences': { body: { dataset_workspace_id: 'ws-1', items: [] } } });

    renderPage();

    expect(await screen.findByText('No Sequences yet')).toBeTruthy();
  });

  it('shows an error when the list cannot be fetched', async () => {
    route({ '/v1/sequences': { status: 500, body: { detail: 'boom' } } });

    renderPage();

    expect(await screen.findByRole('alert')).toBeTruthy();
  });

  it('creates a Sequence from a picked source table and navigates to it', async () => {
    const created = {
      sequence_id: '90000000-0000-0000-0000-00000000000a',
      dataset_workspace_id: 'ws-1',
      thread_id: '91000000-0000-0000-0000-00000000000b',
      origin: 'manual',
      raw_table: { kind: 'connector_source_table', label: 'clickathon.orders' },
      created_at: '2026-08-01T11:00:00Z',
      updated_at: '2026-08-01T11:00:00Z',
      steps: [],
      prepared_tables: [],
      failed_runs: [],
    };
    const fetchMock = vi.spyOn(globalThis, 'fetch');
    fetchMock.mockImplementation(async (input, init) => {
      const url = String(input);
      if (url.includes('/v1/sequences') && init?.method === 'POST') {
        return { ok: true, status: 201, json: async () => created } as Response;
      }
      if (url.includes('/v1/sequences')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ dataset_workspace_id: 'ws-1', items: [] }),
        } as Response;
      }
      if (url.includes('/catalog')) {
        return { ok: true, status: 200, json: async () => CATALOG } as Response;
      }
      if (url.includes('/v1/connector/sources')) {
        return { ok: true, status: 200, json: async () => [SOURCE] } as Response;
      }
      if (url.includes('/projects')) {
        return { ok: true, status: 200, json: async () => PROJECT_PAGE } as Response;
      }
      if (url.includes('/v1/groups')) {
        return { ok: true, status: 200, json: async () => GROUP_PAGE } as Response;
      }
      throw new Error(`unhandled request: ${url}`);
    });

    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: /new sequence/i }));

    fireEvent.click(await screen.findByText(/choose a connected source/i));
    await screen.findByRole('listbox');
    fireEvent.click(await screen.findByText('click-house-db'));

    const tableTrigger = await screen.findByLabelText('Table');
    await waitFor(() => {
      expect(tableTrigger.hasAttribute('disabled')).toBe(false);
    });
    fireEvent.click(tableTrigger);
    await screen.findByRole('listbox');
    fireEvent.click(await screen.findByText('clickathon.orders'));

    fireEvent.change(screen.getByLabelText(/first instruction/i), {
      target: { value: 'Drop rows with a missing email.' },
    });
    fireEvent.click(screen.getByRole('button', { name: /create sequence/i }));

    await waitFor(() => {
      const posted = fetchMock.mock.calls.find(
        ([url, init]) =>
          String(url).endsWith('/v1/sequences') &&
          (init as RequestInit | undefined)?.method === 'POST',
      );
      expect(posted).toBeTruthy();
      const body = JSON.parse((posted?.[1] as RequestInit).body as string) as {
        raw_table: { source_table_name: string };
      };
      // Qualified `database.table` — required by the ClickHouse `remote()`
      // resolution a Sequence Step executes against.
      expect(body.raw_table.source_table_name).toBe('clickathon.orders');
    });
  });
});
