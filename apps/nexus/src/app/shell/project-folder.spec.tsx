/// <reference types="vitest/globals" />
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

import { GroupFolder } from './project-folder';

const group = {
  group_id: 'group-1',
  name: 'Revenue team',
  created_at: '2026-08-05T00:00:00Z',
  updated_at: '2026-08-05T00:00:00Z',
  archived_at: null,
  can_manage: true,
};

const renderFolder = (
  options: {
    expanded?: boolean;
    onNewChat?: (groupId: string) => void;
    onToggle?: (groupId: string) => void;
  } = {},
) => {
  const { expanded = true, onNewChat = vi.fn(), onToggle = vi.fn() } = options;
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return {
    onNewChat,
    ...render(
      <MemoryRouter>
        <QueryClientProvider client={queryClient}>
          <GroupFolder
            group={group}
            getToken={async () => 'token'}
            active
            expanded={expanded}
            onSelect={() => undefined}
            onToggle={onToggle}
            onNewChat={onNewChat}
          />
        </QueryClientProvider>
      </MemoryRouter>,
    ),
  };
};

beforeEach(() => {
  vi.restoreAllMocks();
  vi.spyOn(globalThis, 'fetch').mockResolvedValue({
    ok: true,
    json: async () => ({
      items: [
        {
          thread_id: 'chat-1',
          project_id: group.group_id,
          title: 'Investigate churn',
          status: 'active',
          latest_activity_at: '2026-08-05T00:00:00Z',
          analysis_run_id: null,
        },
      ],
      next_cursor: null,
    }),
  } as Response);
});

describe('GroupFolder', () => {
  it('keeps a keyboard-accessible New chat action alongside chat history', async () => {
    const { onNewChat } = renderFolder();

    expect(await screen.findByRole('link', { name: 'Investigate churn' })).toBeVisible();
    const newChat = screen.getByRole('button', { name: 'New chat in Revenue team' });

    newChat.focus();
    expect(newChat).toHaveFocus();

    fireEvent.click(newChat);
    expect(onNewChat).toHaveBeenCalledWith(group.group_id);
  });

  it('renders an empty state when its Group has no Chat Sessions', async () => {
    vi.mocked(globalThis.fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ items: [], next_cursor: null }),
    } as Response);

    renderFolder();
    await waitFor(() => expect(screen.getByText('No chats')).toBeVisible());
  });

  it('keeps its chat history idle while the Group is closed', () => {
    renderFolder({ expanded: false });

    expect(screen.getByRole('button', { name: 'Revenue team' })).toHaveAttribute('aria-expanded', 'false');
    expect(globalThis.fetch).not.toHaveBeenCalled();
    expect(screen.queryByText('Investigate churn')).not.toBeInTheDocument();
  });

  it('toggles its Group from the full project row', async () => {
    const onToggle = vi.fn();
    renderFolder({ expanded: false, onToggle });

    fireEvent.click(screen.getByRole('button', { name: 'Revenue team' }));
    expect(onToggle).toHaveBeenCalledWith(group.group_id);
  });

  it('renames a Group from visible Save and Cancel actions', async () => {
    renderFolder();

    fireEvent.click(screen.getByRole('button', { name: 'Rename Group' }));

    const name = screen.getByRole('textbox');
    const save = screen.getByRole('button', { name: 'Save' });
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeVisible();
    expect(name).toHaveValue(group.name);
    expect(save).toBeDisabled();

    fireEvent.change(name, { target: { value: '' } });
    expect(save).toBeDisabled();
    fireEvent.change(name, { target: { value: '  Growth team  ' } });
    fireEvent.click(save);

    await waitFor(() => {
      const renamed = vi.mocked(globalThis.fetch).mock.calls.find(
        ([url, init]) =>
          String(url).endsWith(`/v1/groups/${group.group_id}`) &&
          (init as RequestInit | undefined)?.method === 'PATCH',
      );
      expect(renamed).toBeTruthy();
      expect((renamed?.[1] as RequestInit).body).toBe(JSON.stringify({ name: 'Growth team' }));
    });
  });

  it('cancels a Group rename without sending a PATCH', async () => {
    renderFolder();

    fireEvent.click(screen.getByRole('button', { name: 'Rename Group' }));
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(
      vi.mocked(globalThis.fetch).mock.calls.some(
        ([, init]) => (init as RequestInit | undefined)?.method === 'PATCH',
      ),
    ).toBe(false);
  });
});
