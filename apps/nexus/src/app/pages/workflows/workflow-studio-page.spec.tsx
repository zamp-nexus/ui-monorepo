/// <reference types="vitest/globals" />
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

import type { IdentityContext } from '../../types';
import type { WorkflowDetail } from './api';
import { WorkflowStudioPage } from './workflow-studio-page';

const getToken = async () => 'test-token';
const owner: IdentityContext = {
  user_id: 'user-1',
  organization_id: 'organization-1',
  email: 'owner@example.com',
  organization_name: 'Acme',
  role: 'owner',
};

const workflow = (overrides: Partial<WorkflowDetail> = {}): WorkflowDetail => ({
  workflow_id: 'default-analytics',
  name: 'Revenue review',
  is_system: false,
  published_version: null,
  updated_at: null,
  routing_profile: { auto_select_enabled: false, purpose: '', tags: [], example_requests: [], priority: 0 },
  definition: { nodes: [], edges: [] },
  versions: [],
  ...overrides,
});

const renderStudio = () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <WorkflowStudioPage getToken={getToken} identity={owner} />
    </QueryClientProvider>,
  );
};

const routeWorkflows = (initial: WorkflowDetail) => {
  let current = initial;
  return vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url = String(input);
    if (url.endsWith('/v1/workflows/default-analytics') && init?.method === 'PUT') {
      const body = JSON.parse(String(init.body)) as { name: string };
      current = workflow({ ...current, name: body.name });
      return { ok: true, status: 200, json: async () => current } as Response;
    }
    if (url.endsWith('/v1/workflows/default-analytics')) {
      return { ok: true, status: 200, json: async () => current } as Response;
    }
    if (url.endsWith('/v1/workflows')) {
      return {
        ok: true,
        status: 200,
        json: async () => [{
          workflow_id: current.workflow_id,
          name: current.name,
          is_system: current.is_system,
          published_version: current.published_version,
          updated_at: current.updated_at,
          routing_profile: current.routing_profile,
        }],
      } as Response;
    }
    throw new Error(`Unhandled request: ${url}`);
  });
};

beforeEach(() => {
  vi.restoreAllMocks();
});

describe('Workflow Studio rename', () => {
  it('saves a trimmed custom-workflow name and refreshes the sidebar', async () => {
    const fetchMock = routeWorkflows(workflow());
    renderStudio();

    fireEvent.click(await screen.findByRole('button', { name: 'Rename workflow' }));
    const input = screen.getByRole('textbox', { name: 'Workflow name' });
    await waitFor(() => expect(input).toHaveFocus());
    fireEvent.change(input, {
      target: { value: '  Annual revenue review  ' },
    });
    fireEvent.click(screen.getByRole('button', { name: /save draft/i }));

    await waitFor(() => {
      const saved = fetchMock.mock.calls.find(
        ([url, init]) =>
          String(url).endsWith('/v1/workflows/default-analytics') &&
          (init as RequestInit | undefined)?.method === 'PUT',
      );
      expect(saved).toBeTruthy();
      expect(JSON.parse(String((saved?.[1] as RequestInit).body))).toMatchObject({
        name: 'Annual revenue review',
      });
    });
    await waitFor(() => {
      expect(screen.getAllByText('Annual revenue review')).toHaveLength(2);
    });
  });

  it('keeps invalid names local and disables Save draft', async () => {
    routeWorkflows(workflow());
    renderStudio();

    fireEvent.click(await screen.findByRole('button', { name: 'Rename workflow' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Workflow name' }), { target: { value: '   ' } });

    expect(screen.getByText('Enter a workflow name.')).toBeTruthy();
    expect(screen.getByRole('button', { name: /save draft/i })).toHaveProperty('disabled', true);
  });

  it('restores the last saved name when Escape is pressed', async () => {
    routeWorkflows(workflow());
    renderStudio();

    fireEvent.click(await screen.findByRole('button', { name: 'Rename workflow' }));
    const input = screen.getByRole('textbox', { name: 'Workflow name' });
    fireEvent.change(input, { target: { value: 'Discarded rename' } });
    fireEvent.keyDown(input, { key: 'Escape' });

    expect(await screen.findByRole('button', { name: 'Rename workflow' })).toHaveTextContent('Revenue review');
  });

  it('keeps a system workflow title read-only', async () => {
    routeWorkflows(workflow({ is_system: true, name: 'Analytics trust loop' }));
    renderStudio();

    expect(await screen.findByRole('heading', { name: 'Analytics trust loop' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Rename workflow' })).toBeNull();
    expect(screen.queryByRole('button', { name: /save draft/i })).toBeNull();
  });
});
