/// <reference types="vitest/globals" />
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MotionConfig } from 'motion/react';
import { MemoryRouter } from 'react-router-dom';

import App from './app';

const authMocks = vi.hoisted(() => ({
  useAuth: vi.fn(),
  useAuthSession: vi.fn(),
}));

vi.mock('@open-zentra/foundation-auth', () => authMocks);

const readyResponse = {
  status: 'ready',
  dependencies: {
    postgres: { status: 'ready' },
    clickhouse: { status: 'ready' },
    cube: { status: 'ready' },
  },
};

const contextResponse = {
  user_id: '10000000-0000-0000-0000-000000000001',
  tenant_id: '20000000-0000-0000-0000-000000000002',
  email: 'owner@example.com',
  tenant_name: 'Acme Europe',
  role: 'owner',
};

const investigation = {
  investigation_id: '30000000-0000-0000-0000-000000000003',
  canonical_question: 'Why did EU refunds increase from June to July 2026?',
  scenario_key: 'eu_refund_spike',
  status: 'awaiting_approval',
  version: 5,
  evaluation_attempts: 1,
  created_at: '2026-07-29T00:00:00Z',
  updated_at: '2026-07-29T00:00:00Z',
  finished_at: null,
  finding: {
    headline: 'EU refunds rose $240 in July',
    summary:
      'Governed EU refund amount increased while order volume remained flat.',
    metrics: [
      {
        metric: 'refund_amount',
        previous_value: '20.00',
        current_value: '260.00',
        unit: 'USD',
      },
      {
        metric: 'refund_rate',
        previous_value: '25',
        current_value: '75',
        unit: 'percent',
      },
    ],
    evidence_references: [
      'artifact://semantic/eu-refund-spike/2026-06_2026-07',
    ],
  },
  outcome: {
    kind: 'confidence',
    score: 0.42,
    calibration_method: 'evaluator_independent_recheck',
  },
  pending_approval: {
    approval_id: '40000000-0000-0000-0000-000000000004',
    reason: 'low_confidence',
    requested_at: '2026-07-29T00:00:00Z',
    can_decide: true,
  },
  timeline: [
    {
      entry_id: '50000000-0000-0000-0000-000000000005',
      event_type: 'investigation.created',
      status: 'pending',
      created_at: '2026-07-29T00:00:00Z',
      artifact_references: [],
      delivery: 'complete',
      agent_id: null,
      step: null,
      model: null,
    },
    {
      entry_id: '50000000-0000-0000-0000-000000000007',
      event_type: 'agent.execution_completed',
      status: 'running',
      created_at: '2026-07-29T00:00:01Z',
      artifact_references: ['artifact://execution/60000000-0000-0000-0000-000000000006'],
      delivery: 'complete',
      agent_id: 'sql_analyst_v1',
      step: 2,
      model: 'cerebras/zai-glm-4.7',
    },
    {
      entry_id: '50000000-0000-0000-0000-000000000006',
      event_type: 'human_approval.requested',
      status: 'awaiting_approval',
      created_at: '2026-07-29T00:00:02Z',
      artifact_references: [],
      delivery: 'complete',
      agent_id: null,
      step: null,
      model: null,
    },
  ],
  audit_delivery: 'complete',
} as const;

const response = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

const scenariosResponse = [
  {
    key: 'eu_refund_spike',
    question: 'Why did EU refunds increase from June to July 2026?',
    facts: ['EU commerce', 'June \u2192 July 2026', '8 orders'],
  },
  {
    key: 'na_channel_growth',
    question:
      'Which sales channel accounted for the increase in North America revenue from October to November 2026?',
    facts: ['NA commerce', 'October \u2192 November 2026', '300 orders'],
  },
];

const mockApi = (detail: unknown = investigation) =>
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, options) => {
    const url = String(input);
    if (url.endsWith('/health/ready')) return response(readyResponse);
    if (url.endsWith('/v1/context')) return response(contextResponse);
    if (url.endsWith('/v1/scenarios')) return response(scenariosResponse);
    if (url.endsWith('/v1/investigations') && options?.method === 'POST') {
      return response(detail, 201);
    }
    if (url.includes('/v1/investigations/')) return response(detail);
    return response({ detail: 'Not found' }, 404);
  });

const renderApp = (path = '/') => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <MemoryRouter initialEntries={[path]}>
      <QueryClientProvider client={queryClient}>
        <MotionConfig reducedMotion="always">
          <App clerkConfigured />
        </MotionConfig>
      </QueryClientProvider>
    </MemoryRouter>,
  );
};

describe('App', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    authMocks.useAuthSession.mockReturnValue({
      getAccessToken: vi.fn().mockResolvedValue('valid-token'),
    });
  });

  it('renders an explicit Clerk setup state', () => {
    const queryClient = new QueryClient();
    render(
      <MemoryRouter>
        <QueryClientProvider client={queryClient}>
          <App clerkConfigured={false} />
        </QueryClientProvider>
      </MemoryRouter>,
    );
    expect(
      screen.getByRole('heading', { name: /connect clerk/i }),
    ).toBeTruthy();
  });

  it('renders the signed-out observatory entry', () => {
    authMocks.useAuth.mockReturnValue({
      isAuthenticated: false,
      isInitializing: false,
      login: vi.fn(),
    });
    renderApp();
    expect(
      screen.getByRole('heading', { name: /trust is the product/i }),
    ).toBeTruthy();
  });

  it('denies access without an active organization', () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch');
    authMocks.useAuth.mockReturnValue({
      isAuthenticated: true,
      isInitializing: false,
      logout: vi.fn(),
      tenant: null,
      user: { email: 'owner@example.com' },
    });
    renderApp();
    expect(
      screen.getByRole('heading', { name: /select a clerk organization/i }),
    ).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('launches only the governed synthetic scenarios the API offers', async () => {
    const fetchMock = mockApi();
    authMocks.useAuth.mockReturnValue({
      isAuthenticated: true,
      isInitializing: false,
      logout: vi.fn(),
      tenant: { id: 'org_123', name: 'Acme' },
      user: { email: 'owner@example.com' },
    });
    renderApp();
    expect(await screen.findByText('Acme Europe')).toBeTruthy();

    // Rendered from the API, not from a question hardcoded in this bundle.
    expect(
      await screen.findByRole('heading', { name: /eu refunds increase/i }),
    ).toBeTruthy();
    expect(
      screen.getByRole('heading', { name: /which sales channel/i }),
    ).toBeTruthy();

    const launches = screen.getAllByRole('button', {
      name: /begin evidence trace/i,
    });
    expect(launches).toHaveLength(2);
    fireEvent.click(launches[0]);
    expect(
      await screen.findByRole('heading', {
        name: /eu refunds rose \$240 in july/i,
      }),
    ).toBeTruthy();

    const posted = fetchMock.mock.calls.find(
      ([, options]) => (options as RequestInit | undefined)?.method === 'POST',
    );
    expect(JSON.parse(String((posted?.[1] as RequestInit).body))).toEqual({
      scenario_key: 'eu_refund_spike',
    });
  });

  it('launches the second scenario with its own key', async () => {
    const fetchMock = mockApi();
    authMocks.useAuth.mockReturnValue({
      isAuthenticated: true,
      isInitializing: false,
      logout: vi.fn(),
      tenant: { id: 'org_123', name: 'Acme' },
      user: { email: 'owner@example.com' },
    });
    renderApp();
    await screen.findByRole('heading', { name: /which sales channel/i });

    fireEvent.click(
      screen.getAllByRole('button', { name: /begin evidence trace/i })[1],
    );

    await waitFor(() => {
      const posted = fetchMock.mock.calls.find(
        ([, options]) => (options as RequestInit | undefined)?.method === 'POST',
      );
      expect(JSON.parse(String((posted?.[1] as RequestInit).body))).toEqual({
        scenario_key: 'na_channel_growth',
      });
    });
  });

  it('shows persisted evidence and owner approval controls on refresh', async () => {
    mockApi();
    authMocks.useAuth.mockReturnValue({
      isAuthenticated: true,
      isInitializing: false,
      logout: vi.fn(),
      tenant: { id: 'org_123', name: 'Acme' },
      user: { email: 'owner@example.com' },
    });
    renderApp(
      '/investigations/30000000-0000-0000-0000-000000000003',
    );
    expect(
      await screen.findByRole('heading', {
        name: /evidence is coherent/i,
      }),
    ).toBeTruthy();
    expect(screen.getByText('Question registered')).toBeTruthy();
    expect(screen.getByRole('button', { name: /approve finding/i })).toBeTruthy();
    // The agent that produced each step is named on the timeline.
    expect(screen.getByText('SQL Analyst · step 2')).toBeTruthy();
    // The provider and model that actually served the step are named.
    expect(screen.getByText('cerebras/zai-glm-4.7')).toBeTruthy();
    // A score below the tenant threshold gates on low confidence, not policy.
    expect(screen.getByText('42%')).toBeTruthy();
    expect(
      screen.getByRole('heading', {
        name: /confidence below the tenant threshold/i,
      }),
    ).toBeTruthy();
  });

  it('renders read-only approval state for a viewer', async () => {
    mockApi({
      ...investigation,
      pending_approval: { ...investigation.pending_approval, can_decide: false },
    });
    authMocks.useAuth.mockReturnValue({
      isAuthenticated: true,
      isInitializing: false,
      logout: vi.fn(),
      tenant: { id: 'org_123', name: 'Acme' },
      user: { email: 'viewer@example.com' },
    });
    renderApp(
      '/investigations/30000000-0000-0000-0000-000000000003',
    );
    expect(
      await screen.findByText(/owner or admin judgment is required/i),
    ).toBeTruthy();
    expect(screen.queryByRole('button', { name: /approve finding/i })).toBeNull();
  });

  it('announces a completed terminal state after approval', async () => {
    const completed = {
      ...investigation,
      status: 'completed' as const,
      pending_approval: null,
      finished_at: '2026-07-29T00:00:02Z',
    };
    mockApi(completed);
    authMocks.useAuth.mockReturnValue({
      isAuthenticated: true,
      isInitializing: false,
      logout: vi.fn(),
      tenant: { id: 'org_123', name: 'Acme' },
      user: { email: 'owner@example.com' },
    });
    renderApp(
      '/investigations/30000000-0000-0000-0000-000000000003',
    );
    await waitFor(() =>
      expect(screen.getByText('Approved and complete')).toBeTruthy(),
    );
    expect(screen.getByText('completed')).toBeTruthy();
  });

  it('mints a fresh token for every request rather than reusing one', async () => {
    // Clerk session tokens expire after 60 seconds. Caching one in component
    // state meant a page left open sent a dead token on the next click, and the
    // API's "Invalid bearer token" read like a configuration fault.
    const getAccessToken = vi
      .fn()
      .mockResolvedValueOnce('token-1')
      .mockResolvedValueOnce('token-2')
      .mockResolvedValue('token-3');
    authMocks.useAuthSession.mockReturnValue({ getAccessToken });
    const fetchMock = mockApi();
    authMocks.useAuth.mockReturnValue({
      isAuthenticated: true,
      isInitializing: false,
      logout: vi.fn(),
      tenant: { id: 'org_123', name: 'Acme' },
      user: { email: 'owner@example.com' },
    });

    renderApp();
    await screen.findByRole('heading', { name: /which sales channel/i });
    fireEvent.click(
      screen.getAllByRole('button', { name: /begin evidence trace/i })[1],
    );
    await waitFor(() =>
      expect(
        fetchMock.mock.calls.some(
          ([, options]) => (options as RequestInit | undefined)?.method === 'POST',
        ),
      ).toBe(true),
    );

    // One call per authenticated request, not one for the whole session.
    expect(getAccessToken.mock.calls.length).toBeGreaterThan(1);
    const sent = fetchMock.mock.calls
      .map(([, options]) =>
        new Headers((options as RequestInit | undefined)?.headers).get(
          'Authorization',
        ),
      )
      .filter(Boolean);
    expect(new Set(sent).size).toBeGreaterThan(1);
  });

  it('never captions a metric with a month the scenario did not run in', async () => {
    // These read "June X -> July Y", hardcoded from the only scenario that
    // existed. The first live run of the second scenario captioned an
    // October-to-November finding as June to July.
    mockApi();
    authMocks.useAuth.mockReturnValue({
      isAuthenticated: true,
      isInitializing: false,
      logout: vi.fn(),
      tenant: { id: 'org_123', name: 'Acme' },
      user: { email: 'owner@example.com' },
    });

    renderApp('/investigations/30000000-0000-0000-0000-000000000003');
    await screen.findByRole('heading', { name: /evidence is coherent/i });

    // The question itself may name months — this scenario's does. The caption
    // must not, because it does not know which scenario it belongs to.
    const caption = screen.getByText(/20\.00 → 260\.00 USD/);
    expect(caption.textContent).not.toMatch(/june|july/i);
  });
});
