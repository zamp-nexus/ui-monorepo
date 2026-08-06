/// <reference types="vitest/globals" />
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

vi.mock('@assistant-ui/react', () => ({
  AssistantRuntimeProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  ThreadPrimitive: {
    Root: ({ children }: { children: React.ReactNode }) => <>{children}</>,
    Empty: () => null,
    If: () => null,
    Viewport: ({ children }: { children: React.ReactNode }) => <>{children}</>,
    Messages: () => null,
  },
}));

vi.mock('../../shell/app-shell', () => ({
  useWorkspace: () => ({ groupId: 'group-1', selectGroup: vi.fn() }),
}));
vi.mock('./chat-context', () => ({
  ChatContextProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
vi.mock('./chat-empty-state', () => ({ ChatEmptyState: () => null }));
vi.mock('./chat-messages', () => ({ AssistantMessage: () => null, UserMessage: () => null }));
vi.mock('./chat-runtime', () => ({ useChatRuntime: () => ({}) }));
vi.mock('./chat-thinking-indicator', () => ({ ChatThinkingIndicator: () => null }));
vi.mock('./use-send-message', () => ({
  useSendMessage: () => ({
    send: vi.fn(),
    isPending: false,
    error: null,
    pendingUserMessage: null,
    streaming: null,
  }),
}));
vi.mock('./use-thread-events', () => ({ useThreadEvents: () => ({ events: [] }) }));
vi.mock('./chat-composer', () => ({ ChatComposer: () => null }));

import { ChatPage } from './chat-page';

const chat = {
  thread_id: 'chat-1',
  project_id: 'group-1',
  title: 'Investigate churn',
  messages: [],
  event_cursor: 0,
  actions: { can_append_message: true },
};

const renderPage = () => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <MemoryRouter initialEntries={['/chats/chat-1']}>
      <QueryClientProvider client={queryClient}>
        <Routes>
          <Route
            path="/chats/:chatId"
            element={<ChatPage identity={{ email: 'analyst@example.com' } as never} getToken={async () => 'token'} />}
          />
        </Routes>
      </QueryClientProvider>
    </MemoryRouter>,
  );
};

beforeEach(() => {
  vi.restoreAllMocks();
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url = String(input);
    if (url.endsWith('/workflow-executions/latest')) return Response.json(null);
    if (url.endsWith('/v1/chats/chat-1') && init?.method === 'PATCH') return Response.json(chat);
    if (url.endsWith('/v1/chats/chat-1')) return Response.json(chat);
    if (url.endsWith('/v1/agents')) return Response.json([]);
    if (url.endsWith('/v1/catalog')) {
      return Response.json({ dimensions: [], measures: [], sources: [] });
    }
    if (url.endsWith('/v1/workflows')) return Response.json([]);
    return Response.json({ items: [], next_cursor: null });
  });
});

describe('ChatPage rename dialog', () => {
  it('saves a trimmed title from the visible Save button', async () => {
    renderPage();

    fireEvent.click(await screen.findByRole('button', { name: 'Rename Chat' }));
    const title = screen.getByRole('textbox');
    const save = screen.getByRole('button', { name: 'Save' });
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeVisible();
    expect(title).toHaveValue(chat.title);
    expect(save).toBeDisabled();

    fireEvent.change(title, { target: { value: '' } });
    expect(save).toBeDisabled();
    fireEvent.change(title, { target: { value: '  Retain customers  ' } });
    fireEvent.click(save);

    await waitFor(() => {
      const renamed = vi.mocked(globalThis.fetch).mock.calls.find(
        ([url, init]) =>
          String(url).endsWith('/v1/chats/chat-1') &&
          (init as RequestInit | undefined)?.method === 'PATCH',
      );
      expect(renamed).toBeTruthy();
      expect((renamed?.[1] as RequestInit).body).toBe(JSON.stringify({ title: 'Retain customers' }));
    });
  });

  it('submits on Enter and cancels without a PATCH', async () => {
    renderPage();

    fireEvent.click(await screen.findByRole('button', { name: 'Rename Chat' }));
    const title = screen.getByRole('textbox');
    fireEvent.change(title, { target: { value: 'Retention review' } });
    fireEvent.keyDown(title, { key: 'Enter' });

    await waitFor(() => {
      expect(
        vi.mocked(globalThis.fetch).mock.calls.some(
          ([, init]) => (init as RequestInit | undefined)?.method === 'PATCH',
        ),
      ).toBe(true);
    });

    fireEvent.click(await screen.findByRole('button', { name: 'Rename Chat' }));
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
