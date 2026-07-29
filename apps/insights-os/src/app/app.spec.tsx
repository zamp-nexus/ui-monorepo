/// <reference types="vitest/globals" />
import React from 'react';

import { render, screen, waitFor } from '@testing-library/react';

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
  configuration: {
    clerk: true,
    e2b: false,
    telemetry_export: false,
  },
};

const contextResponse = {
  user_id: '10000000-0000-0000-0000-000000000001',
  tenant_id: '20000000-0000-0000-0000-000000000002',
  email: 'owner@example.com',
  tenant_name: 'Acme Europe',
  role: 'owner',
};

const response = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

describe('App', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    authMocks.useAuthSession.mockReturnValue({
      getAccessToken: vi.fn().mockResolvedValue('valid-token'),
    });
  });

  it('renders an explicit Clerk setup state when identity is not configured', () => {
    const { getByRole, getByText } = render(<App clerkConfigured={false} />);

    expect(getByRole('heading', { name: /connect clerk/i })).toBeTruthy();
    expect(getByText('VITE_CLERK_PUBLISHABLE_KEY')).toBeTruthy();
  });

  it('renders the signed-out shell', () => {
    authMocks.useAuth.mockReturnValue({
      isAuthenticated: false,
      isInitializing: false,
      login: vi.fn(),
    });

    render(<App clerkConfigured />);

    expect(screen.getByRole('heading', { name: /trust is the product/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /sign in/i })).toBeTruthy();
  });

  it('denies access when there is no active organization', () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch');
    authMocks.useAuth.mockReturnValue({
      isAuthenticated: true,
      isInitializing: false,
      login: vi.fn(),
      logout: vi.fn(),
      tenant: null,
      user: { email: 'owner@example.com' },
    });

    render(<App clerkConfigured />);

    expect(
      screen.getByRole('heading', { name: /select a clerk organization/i }),
    ).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('shows an unauthorized membership without inventing tenant context', async () => {
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(response(readyResponse))
      .mockResolvedValueOnce(response({ detail: 'Not bound' }, 403));
    authMocks.useAuth.mockReturnValue({
      isAuthenticated: true,
      isInitializing: false,
      login: vi.fn(),
      logout: vi.fn(),
      tenant: { id: 'org_123', name: 'Clerk Organization' },
      user: { email: 'owner@example.com' },
    });

    render(<App clerkConfigured />);

    expect(
      await screen.findByText(/not yet bound to an internal tenant/i),
    ).toBeTruthy();
  });

  it('shows the resolved tenant and healthy foundation', async () => {
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(response(readyResponse))
      .mockResolvedValueOnce(response(contextResponse));
    authMocks.useAuth.mockReturnValue({
      isAuthenticated: true,
      isInitializing: false,
      login: vi.fn(),
      logout: vi.fn(),
      tenant: { id: 'org_123', name: 'Clerk Organization' },
      user: { email: 'owner@example.com' },
    });

    render(<App clerkConfigured />);

    expect(await screen.findByRole('heading', { name: 'Acme Europe' })).toBeTruthy();
    expect(screen.getByText(/owner · tenant 20000000/i)).toBeTruthy();
    expect(screen.getAllByText('ready')).toHaveLength(3);
    expect(screen.getByText('0 agents registered')).toBeTruthy();
  });

  it('surfaces a degraded dependency without leaking details', async () => {
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        response(
          {
            ...readyResponse,
            status: 'degraded',
            dependencies: {
              ...readyResponse.dependencies,
              clickhouse: { status: 'unavailable' },
            },
          },
          503,
        ),
      )
      .mockResolvedValueOnce(response({ detail: 'Not bound' }, 403));
    authMocks.useAuth.mockReturnValue({
      isAuthenticated: true,
      isInitializing: false,
      login: vi.fn(),
      logout: vi.fn(),
      tenant: { id: 'org_123', name: 'Clerk Organization' },
      user: { email: 'owner@example.com' },
    });

    render(<App clerkConfigured />);

    await waitFor(() => expect(screen.getByText('unavailable')).toBeTruthy());
    expect(screen.queryByText(/password|credential/i)).toBeNull();
  });
});
