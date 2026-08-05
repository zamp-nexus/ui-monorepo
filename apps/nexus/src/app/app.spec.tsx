/// <reference types="vitest/globals" />
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { MotionConfig } from 'motion/react';
import { MemoryRouter } from 'react-router-dom';

import App from './app';

const authMocks = vi.hoisted(() => ({
  useAuth: vi.fn(),
  useAuthSession: vi.fn(),
  useAuthTenant: vi.fn(() => ({ setActiveTenant: vi.fn() })),
}));

vi.mock('@open-zentra/foundation-auth', () => authMocks);

const clerkUiMocks = vi.hoisted(() => ({
  useOrganizationMemberships: vi.fn(() => ({
    isLoaded: true,
    memberships: [] as Array<{ readonly id: string; readonly name: string }>,
  })),
}));

vi.mock('@open-zentra/foundation-auth/clerk-ui', () => ({
  ...clerkUiMocks,
  SignIn: () => null,
  SignUp: () => null,
  CreateOrganization: () => null,
}));

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
  organization_id: '20000000-0000-0000-0000-000000000002',
  email: 'owner@example.com',
  organization_name: 'Acme Europe',
  role: 'owner',
};

const response = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

const mockApi = (context: unknown = contextResponse) =>
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
    const url = String(input);
    if (url.endsWith('/health/ready')) return response(readyResponse);
    if (url.endsWith('/v1/context')) return response(context);
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
    expect(screen.getByRole('heading', { name: /connect clerk/i })).toBeTruthy();
    // The only home for this state. It is a build-time branch on
    // VITE_CLERK_PUBLISHABLE_KEY, so a browser journey cannot reach it from an
    // e2e build that has a key — `example.spec.ts` asserted it until the
    // authenticated harness landed and made its premise false.
  });

  it('renders the signed-out observatory entry', () => {
    authMocks.useAuth.mockReturnValue({
      isAuthenticated: false,
      isInitializing: false,
      login: vi.fn(),
    });
    renderApp();
    expect(screen.getByRole('heading', { name: /trust is the product/i })).toBeTruthy();
  });

  it('offers to create an organization when the user has none', () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch');
    authMocks.useAuth.mockReturnValue({
      isAuthenticated: true,
      isInitializing: false,
      logout: vi.fn(),
      tenant: null,
      user: { email: 'owner@example.com' },
    });
    clerkUiMocks.useOrganizationMemberships.mockReturnValue({
      isLoaded: true,
      memberships: [],
    });
    renderApp();
    // `NoOrganizations` renders Clerk's own `<CreateOrganization/>` full-page
    // (stubbed to null above) -- there is no app-owned heading to assert on
    // here, so the meaningful assertion is what it does NOT do: no API call.
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('offers a picker when the user has organizations but none active', () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch');
    authMocks.useAuth.mockReturnValue({
      isAuthenticated: true,
      isInitializing: false,
      logout: vi.fn(),
      tenant: null,
      user: { email: 'owner@example.com' },
    });
    clerkUiMocks.useOrganizationMemberships.mockReturnValue({
      isLoaded: true,
      memberships: [{ id: 'org_123', name: 'Acme' }],
    });
    renderApp();
    expect(screen.getByRole('heading', { name: /choose an organization/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Acme' })).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('keeps the Sequence page available by direct link while Data owns navigation', async () => {
    mockApi();
    authMocks.useAuth.mockReturnValue({
      isAuthenticated: true,
      isInitializing: false,
      logout: vi.fn(),
      tenant: { id: 'org_123', name: 'Acme' },
      user: { email: 'owner@example.com' },
    });

    renderApp('/sequences');

    expect(await screen.findByRole('heading', { name: /^sequences$/i })).toBeTruthy();
    const [dataLink] = screen.getAllByRole('link', { name: /^data$/i });
    expect(dataLink.getAttribute('href')).toBe('/datasets');
  });
});
