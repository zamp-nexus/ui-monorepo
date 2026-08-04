import { useCallback } from 'react';

import { useQuery } from '@tanstack/react-query';
import { Navigate, Route, Routes } from 'react-router-dom';

import { useAuth, useAuthSession, useAuthTenant } from '@open-zentra/foundation-auth';
import { SignIn, SignUp, useOrganizationMemberships } from '@open-zentra/foundation-auth/clerk-ui';

import { ApiError, apiUrl, requestJson, type TokenSource } from './api';
import { ChatPage } from './pages/chat/chat-page';
import { ComingSoon } from './pages/coming-soon';
import { ConnectionsPage } from './pages/connections/connections-page';
import { ConnectorConfig } from './pages/connections/connector-config';
import { ConnectorPicker } from './pages/connections/connector-picker';
import { CubeSchemaPage } from './pages/datasets/cube-schema-page';
import { DatasetsPage } from './pages/datasets/datasets-page';
import { RowsPage } from './pages/datasets/rows-page';
import {
  MembershipUnavailable,
  NoOrganizations,
  OrganizationPicker,
  OrganizationSetupDelayed,
  ResolvingIdentity,
  SetupRequired,
  SignedOut,
} from './pages/entry-screens';
import { InvestigationWorkspace } from './pages/investigation/investigation-workspace';
import { SequenceDetailPage } from './pages/sequences/sequence-detail-page';
import { SequencesPage } from './pages/sequences/sequences-page';
import { AppShell } from './shell/app-shell';
import type { IdentityContext, ReadinessResponse } from './types';

interface AppProps {
  readonly clerkConfigured?: boolean;
}

const requestReadiness = async (): Promise<ReadinessResponse> => {
  const response = await fetch(`${apiUrl}/health/ready`);
  return (await response.json()) as ReadinessResponse;
};

// The Clerk webhook that provisions the backing tenant for a freshly created
// (or freshly joined) Clerk organization can take a few seconds to land.
// `GET /v1/context` answers 403 with this exact detail string in the
// meantime — the API has no structured error code for it yet, so this is a
// deliberate, narrow string match rather than a status-code check (403 is
// shared with the unrelated "no membership in this organization" case,
// which must NOT retry).
const ORGANIZATION_NOT_YET_PROVISIONED_DETAIL =
  'Identity organization is not bound to any organization';
const IDENTITY_RETRY_LIMIT = 8;

const isOrganizationNotYetProvisionedError = (error: unknown): boolean =>
  error instanceof ApiError && error.message === ORGANIZATION_NOT_YET_PROVISIONED_DETAIL;

const AuthenticatedWorkspace = () => {
  const { logout, tenant } = useAuth();
  const { setActiveTenant } = useAuthTenant();
  const { getAccessToken } = useAuthSession();
  const { isLoaded: membershipsLoaded, memberships } = useOrganizationMemberships();
  // A Clerk session token lives 60 seconds. Holding one in component state and
  // reusing it means the first click on a page left open sends a dead token —
  // the API answers "Invalid bearer token" and it reads like a configuration
  // fault. Minting per request costs nothing: Clerk caches internally and
  // refreshes near expiry, so this is a memory read almost every time.
  const getToken = useCallback<TokenSource>(
    () => getAccessToken({ audience: 'first_party_http' }),
    [getAccessToken],
  );
  const readiness = useQuery({
    queryKey: ['readiness'],
    queryFn: requestReadiness,
    enabled: Boolean(tenant?.id),
    retry: false,
  });
  const identity = useQuery({
    queryKey: ['identity-context', tenant?.id],
    queryFn: () => requestJson<IdentityContext>('/v1/context', getToken),
    enabled: Boolean(tenant?.id),
    // Only the "webhook hasn't landed yet" case retries. A genuine "no
    // membership in this organization" error must still fail immediately.
    retry: (attempt, error) =>
      attempt < IDENTITY_RETRY_LIMIT && isOrganizationNotYetProvisionedError(error),
    // Capped exponential backoff: 1s, 2s, 4s, 5s, 5s, 5s, 5s ≈ 27s total.
    retryDelay: (attempt) => Math.min(1000 * 2 ** (attempt - 1), 5000),
  });

  if (!tenant?.id) {
    if (!membershipsLoaded) {
      return <ResolvingIdentity message="Loading your organizations…" />;
    }
    if (memberships.length === 0) {
      return <NoOrganizations />;
    }
    return (
      <OrganizationPicker
        memberships={memberships}
        onSelect={(organizationId) => void setActiveTenant(organizationId)}
        onSignOut={() => void logout()}
      />
    );
  }
  if (identity.isPending) {
    return (
      <ResolvingIdentity
        message={
          identity.failureCount > 0
            ? 'Finishing organization setup…'
            : 'Resolving governed tenant context…'
        }
      />
    );
  }
  if (identity.error) {
    if (isOrganizationNotYetProvisionedError(identity.error)) {
      return <OrganizationSetupDelayed onRetry={() => void identity.refetch()} />;
    }
    return <MembershipUnavailable detail={identity.error.message} />;
  }
  if (!identity.data) {
    return <MembershipUnavailable detail={undefined} />;
  }

  return (
    <AppShell identity={identity.data} readiness={readiness.data}>
      <Routes>
        <Route path="/" element={<Navigate replace to="/chats" />} />
        <Route path="/chats" element={<ChatPage getToken={getToken} identity={identity.data} />} />
        <Route
          path="/chats/:chatId"
          element={<ChatPage getToken={getToken} identity={identity.data} />}
        />
        <Route
          path="/investigations/:id"
          element={<InvestigationWorkspace getToken={getToken} />}
        />
        <Route
          path="/dashboard"
          element={
            <ComingSoon
              title="Dashboard"
              icon="grid"
              description="A tenant-wide view of running investigations, published findings and the approvals waiting on you."
            />
          }
        />
        <Route
          path="/datasets"
          element={<DatasetsPage getToken={getToken} identity={identity.data} />}
        />
        <Route
          path="/sequences"
          element={<SequencesPage getToken={getToken} identity={identity.data} />}
        />
        <Route
          path="/sequences/:sequenceId"
          element={<SequenceDetailPage getToken={getToken} identity={identity.data} />}
        />
        <Route
          path="/datasets/:dataSourceId/tables/:tableName/rows"
          element={<RowsPage getToken={getToken} identity={identity.data} />}
        />
        <Route path="/cube-schema" element={<CubeSchemaPage getToken={getToken} />} />
        <Route
          path="/connections"
          element={<ConnectionsPage getToken={getToken} identity={identity.data} />}
        />
        <Route path="/connections/new" element={<ConnectorPicker />} />
        <Route
          path="/connections/new/:connectorId"
          element={<ConnectorConfig getToken={getToken} identity={identity.data} />}
        />
        <Route
          path="/settings"
          element={
            <ComingSoon
              title="Settings"
              icon="settings"
              description="Tenant policy, approval thresholds, theme and notification preferences."
            />
          }
        />
        <Route path="*" element={<Navigate replace to="/chats" />} />
      </Routes>
    </AppShell>
  );
};

const AuthenticatedEntry = () => {
  const { isAuthenticated, isInitializing } = useAuth();

  if (isInitializing) {
    return <ResolvingIdentity message="Resolving your identity…" />;
  }
  if (!isAuthenticated) {
    return <SignedOut />;
  }
  return <AuthenticatedWorkspace />;
};

export function App({ clerkConfigured = false }: AppProps) {
  if (!clerkConfigured) {
    return <SetupRequired />;
  }
  return (
    <Routes>
      <Route
        path="/sign-in"
        element={<SignIn path="/sign-in" routing="path" signUpUrl="/sign-up" />}
      />
      <Route
        path="/sign-up"
        element={<SignUp path="/sign-up" routing="path" signInUrl="/sign-in" />}
      />
      <Route path="*" element={<AuthenticatedEntry />} />
    </Routes>
  );
}

export default App;
