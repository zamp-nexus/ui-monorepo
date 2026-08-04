/// <reference types="vitest/globals" />
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

import type {
  Agent,
  AgentEventPayload,
  IdentityContext,
  Thread,
  ThreadAnalysisRun,
  ThreadEvent,
  VisualizationBrief,
} from '../../types';
import { AgentActivityBlock } from './agent-activity-block';
import { ChatPage } from './chat-page';
import { toTimeline } from './to-chat-message';

const getToken = async () => 'test-token';

const identity: IdentityContext = {
  user_id: '10000000-0000-0000-0000-000000000001',
  organization_id: '20000000-0000-0000-0000-000000000002',
  email: 'owner@example.com',
  organization_name: 'Acme Europe',
  role: 'owner',
};

const GROUP = {
  group_id: '41000000-0000-0000-0000-000000000001',
  name: 'Workspace',
  created_at: '2026-08-01T09:00:00Z',
  updated_at: '2026-08-01T09:00:00Z',
  archived_at: null,
  can_manage: true,
};

const USAGE = {
  input_tokens: 0,
  output_tokens: 0,
  total_cost_usd: '0',
  latency_ms: 0,
};

const ACTIONS = {
  can_append_message: true,
  can_archive: true,
  can_restore: false,
  can_delete: true,
  can_cancel: false,
  can_retry: false,
};

const clarifiedThread: Thread = {
  thread_id: '43000000-0000-0000-0000-000000000001',
  project_id: GROUP.group_id,
  title: 'How is the business doing?',
  status: 'draft',
  created_at: '2026-08-01T09:00:00Z',
  updated_at: '2026-08-01T09:00:00Z',
  latest_activity_at: '2026-08-01T09:00:00Z',
  messages: [
    {
      message_id: '44000000-0000-0000-0000-000000000001',
      kind: 'user_question',
      content: 'How is the business doing?',
      created_at: '2026-08-01T09:00:00Z',
      authored_by_user: true,
    },
    {
      message_id: '44000000-0000-0000-0000-000000000002',
      kind: 'router_clarification',
      content: 'I could not map that message to a governed question.',
      created_at: '2026-08-01T09:00:01Z',
      authored_by_user: false,
    },
  ],
  analysis_run_id: null,
  analysis_runs: [],
  event_cursor: 2,
  usage: USAGE,
  routing: {
    disposition: 'unsupported',
    scenario_key: null,
    canonical_question: null,
    clarification: 'I could not map that message to a governed question.',
    suggestions: ['Why did EU refunds increase from June to July 2026?'],
  },
  actions: ACTIONS,
};

const encoder = new TextEncoder();

/**
 * `use-send-message` always sends a POST with `Accept: text/event-stream`
 * and reads the response as a stream, never as JSON -- a successful create
 * or append is replayed as the two frames that settle it: `routing` (so
 * `onThreadReady` fires) and the terminal `thread` frame (the same Thread
 * shape `getChat` returns, which is what `use-send-message` writes into the
 * React Query cache).
 */
const sseBody = (frames: readonly { event: string; data: unknown }[]) => {
  const text = frames
    .map((frame) => `event: ${frame.event}\ndata: ${JSON.stringify(frame.data)}\n\n`)
    .join('');
  const bytes = encoder.encode(text);
  let sent = false;
  return {
    getReader: () => ({
      read: async () => {
        if (sent) return { done: true, value: undefined };
        sent = true;
        return { done: false, value: bytes };
      },
    }),
  };
};

const isThread = (body: unknown): body is Thread =>
  Boolean(body) && typeof body === 'object' && 'thread_id' in (body as object);

/**
 * Answer each endpoint by URL, so ordering between them cannot matter.
 *
 * Keyed by method as well as path, because `/groups/{id}/chats` lists on
 * GET and creates on POST, and those return different shapes.
 */
const route = (handlers: Record<string, { status?: number; body: unknown }>) =>
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url = String(input);
    const method = (init?.method ?? 'GET').toUpperCase();
    const key = Object.keys(handlers)
      // Longest fragment wins, so '/chats' cannot shadow '/chats/{id}'.
      .sort((a, b) => b.length - a.length)
      .find((fragment) => {
        const [wanted, path] = fragment.includes(' ') ? fragment.split(' ') : [method, fragment];
        return wanted === method && url.includes(path);
      });
    const handler = key ? handlers[key] : undefined;
    if (!handler) throw new Error(`unhandled ${method}: ${url}`);
    const ok = (handler.status ?? 200) < 400;
    return {
      ok,
      status: handler.status ?? 200,
      body: sseBody(
        method === 'POST' && ok && isThread(handler.body)
          ? [
              { event: 'routing', data: { thread_id: handler.body.thread_id } },
              { event: 'thread', data: handler.body },
            ]
          : [],
      ),
      json: async () => handler.body,
    } as unknown as Response;
  });

const baseRoutes = {
  '/v1/groups': { body: { items: [GROUP], next_cursor: null } },
  '/v1/agents': { body: [] },
  '/v1/catalog': {
    body: {
      measures: [
        {
          name: 'Commerce.refundAmount',
          type: 'number',
          description: 'Value refunded to customers',
          values: [],
        },
      ],
      dimensions: [{ name: 'Commerce.orderedAt', type: 'time', description: null, values: [] }],
    },
  },
  [`GET /v1/groups/${GROUP.group_id}/chats`]: {
    body: { items: [], next_cursor: null },
  },
};

const renderPage = (initialPath = '/chats') => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <QueryClientProvider client={queryClient}>
        {/* `chat-page.tsx` reads the open Thread from the URL (`useParams`)
            and moves to it via `navigate` -- both need an actual matched
            Route, not a bare `MemoryRouter`, to do anything. */}
        <Routes>
          <Route path="/chats" element={<ChatPage getToken={getToken} identity={identity} />} />
          <Route
            path="/chats/:chatId"
            element={<ChatPage getToken={getToken} identity={identity} />}
          />
        </Routes>
      </QueryClientProvider>
    </MemoryRouter>,
  );
};

/** Type into the composer once the workspace has resolved and it is live. */
const ask = async (question: string) => {
  const composer = await screen.findByRole('textbox');
  await waitFor(() => expect(composer.hasAttribute('disabled')).toBe(false));
  await userEvent.type(composer, `${question}{Enter}`);
  return composer;
};

beforeEach(() => {
  vi.restoreAllMocks();
  // jsdom implements no layout, so it has no scrolling either.
  Element.prototype.scrollIntoView = () => undefined;
});

describe('Chat', () => {
  it("builds empty-thread suggestions from this tenant's own catalog", async () => {
    route(baseRoutes);
    renderPage();

    // The measure's description labels the card, and the prompt names the
    // measure — neither is copy written into the bundle.
    expect(await screen.findByText('Value refunded to customers')).toBeTruthy();
    expect(screen.getByText(/refund amount/i)).toBeTruthy();
  });

  it('creates a thread from the first message and renders the snapshot', async () => {
    route({
      ...baseRoutes,
      [`POST /v1/groups/${GROUP.group_id}/chats`]: { body: clarifiedThread },
      [`/v1/chats/${clarifiedThread.thread_id}`]: { body: clarifiedThread },
    });
    renderPage();

    await ask('How is the business doing?');

    expect(
      await screen.findByText('I could not map that message to a governed question.'),
    ).toBeTruthy();
  });

  it('offers the supported questions when the router could not resolve one', async () => {
    route({
      ...baseRoutes,
      [`POST /v1/groups/${GROUP.group_id}/chats`]: { body: clarifiedThread },
      [`/v1/chats/${clarifiedThread.thread_id}`]: { body: clarifiedThread },
    });
    renderPage();

    await ask('How is the business doing?');

    expect(
      await screen.findByRole('button', {
        name: 'Why did EU refunds increase from June to July 2026?',
      }),
    ).toBeTruthy();
  });

  it('closes the composer when the server says a follow-up is not yet legal', async () => {
    const running: Thread = {
      ...clarifiedThread,
      actions: { ...ACTIONS, can_append_message: false, can_cancel: true },
    };
    route({
      ...baseRoutes,
      [`POST /v1/groups/${GROUP.group_id}/chats`]: { body: running },
      [`/v1/chats/${running.thread_id}`]: { body: running },
    });
    renderPage();

    await ask('How is the business doing?');

    await waitFor(() => expect(screen.getByRole('textbox').hasAttribute('disabled')).toBe(true));
  });

  it('explains a workspace it may not provision rather than looping on 403', async () => {
    route({
      ...baseRoutes,
      '/v1/groups': { status: 403, body: { code: 'permission_denied' } },
    });
    renderPage();

    expect(await screen.findByRole('alert')).toBeTruthy();
  });
});

describe('toTimeline', () => {
  const thread = (over: Partial<Thread>): Thread => ({ ...clarifiedThread, ...over });
  const analysis_runs = (...ids: string[]) =>
    ids.map((analysis_run_id) => ({
      analysis_run_id,
    })) as unknown as Thread['analysis_runs'];

  it('derives the role from who authored the message', () => {
    const [question, clarification] = toTimeline(clarifiedThread);
    expect(question.kind === 'message' && question.message.role).toBe('user');
    expect(clarification.kind === 'message' && clarification.message.role).toBe('assistant');
  });

  it('renders an answer the server never sent as a message', () => {
    // A resolved Thread holds only the question; the answer is on the
    // Analysis Run. Rendering messages alone would show nothing.
    const answered = thread({
      messages: [clarifiedThread.messages[0]],
      routing: null,
      analysis_runs: analysis_runs('i-1'),
    });

    const timeline = toTimeline(answered);
    expect(timeline.map((entry) => entry.kind)).toEqual(['message', 'answer']);
    expect(timeline[1].kind === 'answer' && timeline[1].analysisRun.analysis_run_id).toBe('i-1');
  });

  it('never gives a clarified question an answer', () => {
    const timeline = toTimeline(thread({ analysis_runs: analysis_runs('i-1') }));
    expect(timeline.some((entry) => entry.kind === 'answer')).toBe(false);
  });

  it('never gives a non-analytical question an answer, and does not skew later pairings', () => {
    // Regression: a "hello" followed by a real question used to consume the
    // wrong Analysis Run, off by one, because only `router_clarification`
    // was recognized as "this question got no Analysis Run" -- not
    // `assistant_reply` (ADR-0033's Conversational Agent output).
    const withGreeting = thread({
      messages: [
        {
          message_id: 'm-1',
          kind: 'user_question',
          content: 'Hello!',
          created_at: '2026-08-01T09:00:00Z',
          authored_by_user: true,
        },
        {
          message_id: 'm-2',
          kind: 'assistant_reply',
          content: 'Hi there!',
          created_at: '2026-08-01T09:00:01Z',
          authored_by_user: false,
        },
        {
          message_id: 'm-3',
          kind: 'user_question',
          content: 'Why did EU refunds increase?',
          created_at: '2026-08-01T09:00:02Z',
          authored_by_user: true,
        },
      ],
      routing: null,
      analysis_runs: analysis_runs('i-1'),
    });

    const timeline = toTimeline(withGreeting);
    expect(timeline.map((entry) => entry.id)).toEqual(['m-1', 'm-2', 'm-3', 'i-1']);
  });

  it('keeps each answer beside the question that produced it', () => {
    const followUp = thread({
      messages: [
        clarifiedThread.messages[0],
        {
          message_id: 'm-2',
          kind: 'user_question',
          content: 'And in August?',
          created_at: '2026-08-01T09:05:00Z',
          authored_by_user: true,
        },
      ],
      routing: null,
      analysis_runs: analysis_runs('i-1', 'i-2'),
    });

    const timeline = toTimeline(followUp);
    expect(timeline.map((entry) => entry.id)).toEqual([
      clarifiedThread.messages[0].message_id,
      'i-1',
      'm-2',
      'i-2',
    ]);
  });
});

describe('the brief a reader falls back to', () => {
  const brief: VisualizationBrief = {
    schema_version: '1.0',
    analysis_run_id: 'i-1',
    question: 'Why did EU refunds increase?',
    headline: 'EU refunds rose 12%',
    summary: 'Refunds increased across both months.',
    view: 'bar',
    metrics: [
      {
        label: 'refund_rate',
        exact_value: '0.12',
        display_value: '12 %',
        unit: '%',
        direction: 'up',
        citation_ids: ['c-1'],
      },
    ],
    comparisons: [],
    time_range: { start_label: 'June', end_label: 'July' },
    series: [
      {
        label: 'refund_rate',
        dimensions: [],
        unit: '%',
        points: [
          {
            position: 0,
            label: 'June',
            exact_value: '0.10',
            display_value: '10 %',
            citation_ids: ['c-1'],
          },
          {
            position: 1,
            label: 'July',
            exact_value: '0.12',
            display_value: '12 %',
            citation_ids: ['c-1'],
          },
        ],
      },
    ],
    claims: [{ kind: 'observed', text: 'Refunds rose.', citation_ids: ['c-1'] }],
    caveats: [],
    outcome_kind: 'confidence',
    confidence: 0.8,
    actions: [],
  };

  const withVisualization = (over: Record<string, unknown>) => {
    const answered: Thread = {
      ...clarifiedThread,
      messages: [
        clarifiedThread.messages[0],
        {
          message_id: 'm-2',
          kind: 'agent_answer',
          content: 'Refunds rose.',
          created_at: '2026-08-01T09:00:02Z',
          authored_by_user: false,
        },
      ],
      analysis_run_id: 'i-1',
      analysis_runs: [{ analysis_run_id: 'i-1' }] as unknown as Thread['analysis_runs'],
    };
    route({
      ...baseRoutes,
      [`POST /v1/groups/${GROUP.group_id}/chats`]: { body: answered },
      [`/v1/chats/${answered.thread_id}`]: { body: answered },
      '/visualization': {
        body: {
          visualization_id: 'v-1',
          analysis_run_id: 'i-1',
          renderer_kind: 'thesys_c1',
          model: null,
          api_version: null,
          c1_response: null,
          input_tokens: 0,
          output_tokens: 0,
          cost_usd: '0',
          latency_ms: 0,
          failure_category: null,
          retry_of_visualization_id: null,
          fallback_brief: brief,
          created_at: '2026-08-01T09:00:00Z',
          updated_at: '2026-08-01T09:00:00Z',
          erased_at: null,
          erasure_category: null,
          ...over,
        },
      },
    });
  };

  it('carries the whole answer when the brief could not be produced', async () => {
    withVisualization({ status: 'failed', failure_category: 'renderer_unavailable' });
    renderPage();

    await ask('Why did EU refunds increase?');

    expect(await screen.findByText('EU refunds rose 12%')).toBeTruthy();
    // Once in the agent's own message, once as a cited claim in the brief.
    expect(screen.getAllByText('Refunds rose.')).toHaveLength(2);
    // The metric and the claim each cite the same measurement.
    expect(screen.getAllByLabelText('Open supporting evidence 1')).toHaveLength(2);
    // The chart restates the same two governed points, and the current one
    // also stands alone as a metric card.
    expect(screen.getByText('10 %')).toBeTruthy();
    expect(screen.getAllByText('12 %')).toHaveLength(2);
    expect(screen.getByRole('img', { name: 'June: 10 %, July: 12 %' })).toBeTruthy();
    // A failed render is the one state a reader can act on.
    expect(await screen.findByRole('button', { name: 'Render again' })).toBeTruthy();
  });

  it('says why it is showing the brief while it is still pending', async () => {
    withVisualization({ status: 'pending' });
    renderPage();

    await ask('Why did EU refunds increase?');

    expect(await screen.findByText(/Preparing the governed brief/, { exact: false })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Render again' })).toBeFalsy();
  });

  it('says why it is showing the brief while it is still generating', async () => {
    withVisualization({ status: 'generating' });
    renderPage();

    await ask('Why did EU refunds increase?');

    expect(await screen.findByText(/Preparing the governed brief/, { exact: false })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Render again' })).toBeFalsy();
  });

  it('says the rendered view was erased when the visualization is tombstoned', async () => {
    withVisualization({ status: 'tombstoned' });
    renderPage();

    await ask('Why did EU refunds increase?');

    expect(await screen.findByText(/rendered view was erased/, { exact: false })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Render again' })).toBeFalsy();
  });
});

describe('Agent Activity', () => {
  const AGENT_A: Agent = {
    agent_id: 'agent-a',
    role: 'sql_analyst',
    version: '1',
    display_name: 'Cube Analyst',
    description: '',
    enabled: true,
    evaluation_status: 'passed',
    capabilities: [],
  };
  const AGENT_B: Agent = {
    agent_id: 'agent-b',
    role: 'insight',
    version: '1',
    display_name: 'Insight Agent',
    description: '',
    enabled: true,
    evaluation_status: 'passed',
    capabilities: [],
  };

  const agentPayload = (over: Partial<AgentEventPayload>): AgentEventPayload => ({
    type: 'agent',
    execution_id: 'exec-1',
    agent_id: AGENT_A.agent_id,
    role: AGENT_A.role,
    capability_id: null,
    from_agent_id: null,
    to_agent_id: null,
    summary: null,
    provider: null,
    model: null,
    fallback_count: 0,
    latency_ms: null,
    input_tokens: 0,
    output_tokens: 0,
    cost_usd: '0',
    ...over,
  });

  const threadEvent = (
    id: string,
    threadId: string,
    sequence: number,
    kind: ThreadEvent['kind'],
    payload: ThreadEvent['payload'],
  ): ThreadEvent => ({
    event_id: id,
    organization_id: identity.organization_id,
    thread_id: threadId,
    sequence,
    kind,
    occurred_at: `2026-08-04T10:00:${String(sequence).padStart(2, '0')}Z`,
    payload,
  });

  const baseAnalysisRun = (over: Partial<ThreadAnalysisRun>): ThreadAnalysisRun => ({
    analysis_run_id: 'ar-1',
    sequence: 1,
    status: 'running',
    parent_analysis_run_id: null,
    retry_of_analysis_run_id: null,
    created_at: '2026-08-04T10:00:00Z',
    updated_at: '2026-08-04T10:00:00Z',
    canonical_question: 'Why did EU refunds increase?',
    finding: null,
    draft_finding: null,
    outcome: null,
    approval: null,
    citations: [],
    audit_delivery: 'pending',
    usage: USAGE,
    ...over,
  });

  /** A body that yields every event in one chunk, as `useThreadEvents` reads it. */
  const eventsStreamBody = (frames: readonly ThreadEvent[]) => {
    const text = frames.map((value) => `data: ${JSON.stringify(value)}\n\n`).join('');
    const bytes = encoder.encode(text);
    let sent = false;
    return {
      getReader: () => ({
        read: async () => {
          if (sent) return { done: true, value: undefined };
          sent = true;
          return { done: false, value: bytes };
        },
      }),
    };
  };

  /**
   * `route()` plus one extra branch: the Work Feed's `GET .../events` reads
   * `response.body` as a stream rather than `.json()`, so it needs a real
   * (fake) stream, not the plain object every other endpoint here returns.
   */
  const routeWithEvents = (
    handlers: Record<string, { status?: number; body: unknown }>,
    threadId: string,
    feedEvents: readonly ThreadEvent[],
  ) =>
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = String(input);
      const method = (init?.method ?? 'GET').toUpperCase();
      if (method === 'GET' && url.includes(`/v1/chats/${threadId}/events`)) {
        return {
          ok: true,
          status: 200,
          body: eventsStreamBody(feedEvents),
          json: async () => ({}),
        } as unknown as Response;
      }
      const key = Object.keys(handlers)
        .sort((a, b) => b.length - a.length)
        .find((fragment) => {
          const [wanted, path] = fragment.includes(' ') ? fragment.split(' ') : [method, fragment];
          return wanted === method && url.includes(path);
        });
      const handler = key ? handlers[key] : undefined;
      if (!handler) throw new Error(`unhandled ${method}: ${url}`);
      const ok = (handler.status ?? 200) < 400;
      return {
        ok,
        status: handler.status ?? 200,
        body: sseBody(
          method === 'POST' && ok && isThread(handler.body)
            ? [
                { event: 'routing', data: { thread_id: handler.body.thread_id } },
                { event: 'thread', data: handler.body },
              ]
            : [],
        ),
        json: async () => handler.body,
      } as unknown as Response;
    });

  it('groups a live turn into one block, expanded, tagging its two agents distinctly', async () => {
    const threadId = '43000000-0000-0000-0000-000000000050';
    const runningThread: Thread = {
      ...clarifiedThread,
      thread_id: threadId,
      messages: [
        {
          message_id: 'm-1',
          kind: 'user_question',
          content: 'Why did EU refunds increase?',
          created_at: '2026-08-04T10:00:00Z',
          authored_by_user: true,
        },
      ],
      analysis_run_id: 'ar-1',
      analysis_runs: [baseAnalysisRun({})],
      routing: null,
      event_cursor: 0,
    };

    // One turn, two agents, one handoff between them -- exactly the shape a
    // grouped block exists to make sense of.
    const feedEvents: ThreadEvent[] = [
      threadEvent('e1', threadId, 1, 'analysis_run.queued', {
        type: 'analysis_run',
        analysis_run_id: 'ar-1',
        status: 'pending',
        parent_analysis_run_id: null,
        retry_of_analysis_run_id: null,
        failure_category: null,
      }),
      threadEvent(
        'e2',
        threadId,
        2,
        'agent.started',
        agentPayload({
          agent_id: AGENT_A.agent_id,
          role: AGENT_A.role,
          summary: 'Reading governed metrics…',
        }),
      ),
      threadEvent(
        'e3',
        threadId,
        3,
        'agent.handoff',
        agentPayload({
          agent_id: AGENT_A.agent_id,
          role: AGENT_A.role,
          from_agent_id: AGENT_A.agent_id,
          to_agent_id: AGENT_B.agent_id,
          summary: 'Handing off for independent review',
        }),
      ),
      threadEvent(
        'e4',
        threadId,
        4,
        'agent.completed',
        agentPayload({ agent_id: AGENT_B.agent_id, role: AGENT_B.role }),
      ),
      threadEvent('e5', threadId, 5, 'finding.published', {
        type: 'finding',
        analysis_run_id: 'ar-1',
        citation_count: 1,
      }),
    ];

    // The snapshot the server hands back for every GET stays `running` here
    // -- this turn never settles, on purpose, so the block's own expanded
    // state can be observed without racing a background refetch. The
    // collapse-on-finalize transition itself is covered directly against
    // `AgentActivityBlock` below, where `finalized` is a prop, not a network
    // event several promises away.
    routeWithEvents(
      {
        ...baseRoutes,
        '/v1/agents': { body: [AGENT_A, AGENT_B] },
        [`POST /v1/groups/${GROUP.group_id}/chats`]: { body: runningThread },
        [`/v1/chats/${threadId}`]: { body: runningThread },
      },
      threadId,
      feedEvents,
    );

    renderPage();
    await ask('Why did EU refunds increase?');

    const block = await screen.findByTestId('agent-activity-block');
    // In flight: expanded, and the two agents read as two distinct lines.
    expect(within(block).getByRole('button', { expanded: true })).toBeTruthy();

    const analystLine = within(block).getByText('Cube Analyst').closest('[data-agent-key]');
    const insightLine = within(block).getByText('Insight Agent').closest('[data-agent-key]');
    expect(analystLine).toBeTruthy();
    expect(insightLine).toBeTruthy();
    expect(analystLine?.getAttribute('data-agent-key')).not.toBe(
      insightLine?.getAttribute('data-agent-key'),
    );
    expect((analystLine as HTMLElement).querySelector('strong')?.getAttribute('style')).not.toBe(
      (insightLine as HTMLElement).querySelector('strong')?.getAttribute('style'),
    );

    // No side panel exists anywhere in this tree.
    expect(screen.queryByTestId('activity-inspector')).toBeNull();
    expect(screen.queryByRole('button', { name: /activity panel/i })).toBeNull();
    expect(screen.queryByRole('separator', { name: /resize the activity panel/i })).toBeNull();
  });

  it('auto-collapses the instant its turn finalizes, and stays manually toggleable either way', async () => {
    const events: readonly ThreadEvent[] = [
      threadEvent(
        'e1',
        'thread-1',
        1,
        'agent.started',
        agentPayload({ agent_id: AGENT_A.agent_id, role: AGENT_A.role, summary: 'Working…' }),
      ),
      threadEvent(
        'e2',
        'thread-1',
        2,
        'agent.completed',
        agentPayload({ agent_id: AGENT_A.agent_id, role: AGENT_A.role }),
      ),
    ];

    const { rerender } = render(
      <AgentActivityBlock events={events} agents={[AGENT_A]} finalized={false} />,
    );

    // Still in flight: expanded with nobody having clicked anything.
    expect(screen.getByRole('button', { expanded: true })).toBeTruthy();

    // The turn finalizes -- the block collapses on its own.
    rerender(<AgentActivityBlock events={events} agents={[AGENT_A]} finalized={true} />);
    expect(screen.getByRole('button', { expanded: false })).toBeTruthy();

    // From here it is freely toggleable by hand, in either direction.
    await userEvent.click(screen.getByRole('button'));
    expect(screen.getByRole('button', { expanded: true })).toBeTruthy();
    await userEvent.click(screen.getByRole('button'));
    expect(screen.getByRole('button', { expanded: false })).toBeTruthy();
  });

  it('renders one collapsed block per already-completed turn, each independently toggleable, with no side panel', async () => {
    const threadId = '43000000-0000-0000-0000-000000000051';

    const historicalRun = (id: string, question: string): ThreadAnalysisRun =>
      baseAnalysisRun({
        analysis_run_id: id,
        status: 'completed',
        audit_delivery: 'complete',
        canonical_question: question,
        finding: {
          headline: `${question} -- answered`,
          summary: 'Answered.',
          metrics: [],
          evidence_references: [],
        },
      });

    const historicalThread: Thread = {
      ...clarifiedThread,
      thread_id: threadId,
      messages: [
        {
          message_id: 'h-1',
          kind: 'user_question',
          content: 'Why did EU refunds increase?',
          created_at: '2026-08-01T09:00:00Z',
          authored_by_user: true,
        },
        {
          message_id: 'h-2',
          kind: 'user_question',
          content: 'And in August?',
          created_at: '2026-08-01T09:05:00Z',
          authored_by_user: true,
        },
      ],
      analysis_run_id: 'ar-2',
      analysis_runs: [
        historicalRun('ar-1', 'Why did EU refunds increase?'),
        historicalRun('ar-2', 'And in August?'),
      ],
      routing: null,
      event_cursor: 0,
    };

    // Both turns' Work Feed events, still sitting in the retained backlog --
    // one agent per turn is enough here; the handoff case is covered above.
    const feedEvents: ThreadEvent[] = [
      threadEvent('e1', threadId, 1, 'analysis_run.queued', {
        type: 'analysis_run',
        analysis_run_id: 'ar-1',
        status: 'pending',
        parent_analysis_run_id: null,
        retry_of_analysis_run_id: null,
        failure_category: null,
      }),
      threadEvent(
        'e2',
        threadId,
        2,
        'agent.started',
        agentPayload({ agent_id: AGENT_A.agent_id, role: AGENT_A.role, summary: 'Working…' }),
      ),
      threadEvent(
        'e3',
        threadId,
        3,
        'agent.completed',
        agentPayload({ agent_id: AGENT_A.agent_id, role: AGENT_A.role }),
      ),
      threadEvent('e4', threadId, 4, 'finding.published', {
        type: 'finding',
        analysis_run_id: 'ar-1',
        citation_count: 1,
      }),
      threadEvent('e5', threadId, 5, 'analysis_run.queued', {
        type: 'analysis_run',
        analysis_run_id: 'ar-2',
        status: 'pending',
        parent_analysis_run_id: null,
        retry_of_analysis_run_id: null,
        failure_category: null,
      }),
      threadEvent(
        'e6',
        threadId,
        6,
        'agent.started',
        agentPayload({ agent_id: AGENT_B.agent_id, role: AGENT_B.role, summary: 'Working…' }),
      ),
      threadEvent(
        'e7',
        threadId,
        7,
        'agent.completed',
        agentPayload({ agent_id: AGENT_B.agent_id, role: AGENT_B.role }),
      ),
      threadEvent('e8', threadId, 8, 'finding.published', {
        type: 'finding',
        analysis_run_id: 'ar-2',
        citation_count: 1,
      }),
    ];

    routeWithEvents(
      {
        ...baseRoutes,
        '/v1/agents': { body: [AGENT_A, AGENT_B] },
        [`/v1/chats/${threadId}`]: { body: historicalThread },
      },
      threadId,
      feedEvents,
    );

    renderPage(`/chats/${threadId}`);

    const blocks = await screen.findAllByTestId('agent-activity-block');
    expect(blocks).toHaveLength(2);
    for (const block of blocks) {
      expect(within(block).getByRole('button', { expanded: false })).toBeTruthy();
    }

    // Expanding the first leaves the second exactly as it was.
    await userEvent.click(within(blocks[0]).getByRole('button'));
    expect(within(blocks[0]).getByRole('button', { expanded: true })).toBeTruthy();
    expect(within(blocks[0]).getByText('Cube Analyst')).toBeTruthy();
    expect(within(blocks[1]).getByRole('button', { expanded: false })).toBeTruthy();
    expect(within(blocks[1]).queryByText('Cube Analyst')).toBeNull();

    await userEvent.click(within(blocks[0]).getByRole('button'));
    expect(within(blocks[0]).getByRole('button', { expanded: false })).toBeTruthy();

    expect(screen.queryByTestId('activity-inspector')).toBeNull();
    expect(screen.queryByRole('button', { name: /activity panel/i })).toBeNull();
    expect(screen.queryByRole('separator', { name: /resize the activity panel/i })).toBeNull();
  });
});
