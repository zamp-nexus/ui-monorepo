import { useCallback, useEffect, useState } from 'react';

import { useAuth, useAuthSession } from '@open-zentra/foundation-auth';

import styles from './app.module.scss';

interface AppProps {
  readonly clerkConfigured?: boolean;
}

interface DependencyStatus {
  readonly status: 'ready' | 'unavailable';
}

interface ReadinessResponse {
  readonly status: 'ready' | 'degraded';
  readonly dependencies: Readonly<Record<string, DependencyStatus>>;
  readonly configuration: Readonly<Record<string, boolean>>;
}

interface IdentityContext {
  readonly user_id: string;
  readonly tenant_id: string;
  readonly email: string;
  readonly tenant_name: string;
  readonly role: 'owner' | 'admin' | 'member' | 'viewer';
}

type ConnectionState =
  | { readonly kind: 'checking' }
  | { readonly kind: 'ready'; readonly readiness: ReadinessResponse }
  | { readonly kind: 'degraded'; readonly readiness: ReadinessResponse }
  | { readonly kind: 'unreachable'; readonly message: string };

const apiUrl =
  (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, '') ??
  'http://localhost:8000';

const ProductMark = () => (
  <div className={styles.brand}>
    <span className={styles.mark} aria-hidden="true">
      Z
    </span>
    <div>
      <strong>ZentraOS</strong>
      <span>Trust-first analytics</span>
    </div>
  </div>
);

const SetupRequired = () => (
  <main className={styles.page}>
    <header className={styles.header}>
      <ProductMark />
      <span className={styles.phase}>Phase 0 · Foundation</span>
    </header>
    <section className={styles.hero}>
      <p className={styles.eyebrow}>Identity setup required</p>
      <h1>Connect Clerk to enter the workspace.</h1>
      <p>
        Add <code>VITE_CLERK_PUBLISHABLE_KEY</code> to the frontend environment. No
        development tenant is silently assumed.
      </p>
    </section>
  </main>
);

const SignedOut = ({ login }: { readonly login: () => Promise<void> }) => (
  <main className={styles.page}>
    <header className={styles.header}>
      <ProductMark />
      <span className={styles.phase}>Phase 0 · Foundation</span>
    </header>
    <section className={styles.hero}>
      <p className={styles.eyebrow}>A verifiable analytics department</p>
      <h1>Trust is the product.</h1>
      <p>
        ZentraOS makes every analytical claim traceable, replayable, and subject to
        a real confidence gate.
      </p>
      <button className={styles.primaryAction} type="button" onClick={() => void login()}>
        Sign in to your workspace
      </button>
    </section>
  </main>
);

const StatusGrid = ({ state }: { readonly state: ConnectionState }) => {
  if (state.kind === 'checking') {
    return <p className={styles.muted}>Checking the foundation services…</p>;
  }
  if (state.kind === 'unreachable') {
    return <p className={styles.error}>{state.message}</p>;
  }

  return (
    <div className={styles.statusGrid}>
      {Object.entries(state.readiness.dependencies).map(([name, dependency]) => (
        <article className={styles.statusCard} key={name}>
          <span className={styles.statusLabel}>{name}</span>
          <strong data-status={dependency.status}>{dependency.status}</strong>
        </article>
      ))}
    </div>
  );
};

const AuthenticatedWorkspace = () => {
  const { logout, tenant, user } = useAuth();
  const { getAccessToken } = useAuthSession();
  const [connection, setConnection] = useState<ConnectionState>({ kind: 'checking' });
  const [identity, setIdentity] = useState<IdentityContext | null>(null);

  const refresh = useCallback(async (showChecking = true) => {
    if (showChecking) {
      setConnection({ kind: 'checking' });
    }
    try {
      const readinessResponse = await fetch(`${apiUrl}/health/ready`);
      const readiness = (await readinessResponse.json()) as ReadinessResponse;
      setConnection({
        kind: readinessResponse.ok ? 'ready' : 'degraded',
        readiness,
      });

      const token = await getAccessToken({ audience: 'first_party_http' });
      if (token) {
        const contextResponse = await fetch(`${apiUrl}/v1/context`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (contextResponse.ok) {
          setIdentity((await contextResponse.json()) as IdentityContext);
        } else {
          setIdentity(null);
        }
      }
    } catch (error) {
      setConnection({
        kind: 'unreachable',
        message: error instanceof Error ? error.message : 'The API could not be reached.',
      });
    }
  }, [getAccessToken]);

  useEffect(() => {
    if (!tenant?.id) {
      return undefined;
    }
    const refreshTimer = window.setTimeout(() => void refresh(false), 0);
    return () => window.clearTimeout(refreshTimer);
  }, [refresh, tenant?.id]);

  if (!tenant?.id) {
    return (
      <main className={styles.page}>
        <header className={styles.header}>
          <ProductMark />
          <button className={styles.textAction} type="button" onClick={() => void logout()}>
            Sign out
          </button>
        </header>
        <section className={styles.hero}>
          <p className={styles.eyebrow}>Organization required</p>
          <h1>Select a Clerk organization to continue.</h1>
          <p>ZentraOS never falls back to a shared or caller-supplied tenant.</p>
        </section>
      </main>
    );
  }

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <ProductMark />
        <div className={styles.headerActions}>
          <span>{user?.email}</span>
          <button className={styles.textAction} type="button" onClick={() => void logout()}>
            Sign out
          </button>
        </div>
      </header>

      <section className={styles.workspace}>
        <div>
          <p className={styles.eyebrow}>Phase 0 · Foundation</p>
          <h1>{identity?.tenant_name ?? tenant.name ?? 'Your ZentraOS workspace'}</h1>
          <p className={styles.muted}>
            {identity
              ? `${identity.role} · tenant ${identity.tenant_id.slice(0, 8)}`
              : 'Your Clerk organization is not yet bound to an internal tenant.'}
          </p>
        </div>
        <button className={styles.secondaryAction} type="button" onClick={() => void refresh(true)}>
          Recheck services
        </button>
      </section>

      <section className={styles.foundation} aria-labelledby="foundation-title">
        <div className={styles.sectionHeading}>
          <div>
            <p className={styles.eyebrow}>System readiness</p>
            <h2 id="foundation-title">Trust spine</h2>
          </div>
          <span className={styles.zeroAgents}>0 agents registered</span>
        </div>
        <StatusGrid state={connection} />
      </section>
    </main>
  );
};

const AuthenticatedEntry = () => {
  const { isAuthenticated, isInitializing, login } = useAuth();

  if (isInitializing) {
    return (
      <main className={styles.centered}>
        <ProductMark />
        <p className={styles.muted}>Resolving your identity…</p>
      </main>
    );
  }
  if (!isAuthenticated) {
    return <SignedOut login={() => login()} />;
  }
  return <AuthenticatedWorkspace />;
};

export function App({ clerkConfigured = false }: AppProps) {
  return clerkConfigured ? <AuthenticatedEntry /> : <SetupRequired />;
}

export default App;
