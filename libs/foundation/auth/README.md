# @open-insights-web/foundation-auth

Enterprise-grade authentication library integrating **Ory** with **Convex** for the Open Insights Web platform.

## Features

- **Ory Integration**: Full support for Ory Kratos (identity) and Hydra (OAuth2/OIDC)
- **Convex Compatibility**: Server-side helpers for protected Convex functions
- **React Hooks**: Type-safe hooks for authentication state and flows
- **Session Management**: Automatic session refresh and state tracking
- **Permission System**: Role-based access control with permissions derived from user roles
- **TypeScript First**: Full type safety with comprehensive type definitions

## Installation

```bash
npm install @open-insights-web/foundation-auth
```

### Peer Dependencies

```bash
npm install @ory/client-fetch @ory/elements-react react convex
```

## Quick Start

### 1. Configure AuthProvider

```tsx
import { AuthProvider } from '@open-insights-web/foundation-auth';

const App = () => (
  <AuthProvider
    config={{
      ory: {
        kratosUrl: 'https://your-project.ory.cloud',
        // Optional: hydraUrl for OAuth2/OIDC
        hydraUrl: 'https://your-hydra.ory.cloud',
      },
      convex: {
        issuer: 'https://your-project.ory.cloud',
        applicationId: 'your-convex-app-id',
      },
      autoRefreshSession: true,
      sessionRefreshIntervalMs: 300000, // 5 minutes
    }}
    loadingComponent={<LoadingSpinner />}
    errorComponent={(error) => <ErrorMessage error={error} />}
  >
    <YourApp />
  </AuthProvider>
);
```

### 2. Use Authentication Hooks

```tsx
import { useAuth, useAuthUser } from '@open-insights-web/foundation-auth';

const ProfilePage = () => {
  const { isAuthenticated, isLoading, login, logout, hasPermission } = useAuth();
  const { user } = useAuthUser();

  if (isLoading) {
    return <LoadingSpinner />;
  }

  if (!isAuthenticated) {
    return (
      <div>
        <p>Please log in to continue</p>
        <button onClick={() => login()}>Login</button>
      </div>
    );
  }

  return (
    <div>
      <h1>Welcome, {user?.name || user?.email}</h1>
      <p>Role: {user?.role}</p>

      {hasPermission('canManageUsers') && <AdminPanel />}

      <button onClick={() => logout()}>Logout</button>
    </div>
  );
};
```

## Configuration Options

### AuthConfig

| Property                   | Type      | Required | Description                               |
| -------------------------- | --------- | -------- | ----------------------------------------- |
| `ory.kratosUrl`            | `string`  | Yes      | Ory Kratos public URL                     |
| `ory.hydraUrl`             | `string`  | No       | Ory Hydra public URL (for OAuth2)         |
| `ory.projectSlug`          | `string`  | No       | Ory Network project slug                  |
| `convex.issuer`            | `string`  | No       | OIDC issuer URL for Convex                |
| `convex.applicationId`     | `string`  | No       | Convex application ID                     |
| `sessionRefreshIntervalMs` | `number`  | No       | Session refresh interval (default: 5 min) |
| `autoRefreshSession`       | `boolean` | No       | Enable auto-refresh (default: true)       |
| `debug`                    | `boolean` | No       | Enable debug logging                      |

## Hooks API Reference

### useAuth()

Main authentication hook providing state and actions.

```tsx
const {
  // State
  isInitializing, // boolean - Initial auth check in progress
  isLoading, // boolean - Any auth operation in progress
  isAuthenticated, // boolean - User is authenticated
  user, // AuthUser | null - Current user
  error, // Error | null - Last error
  state, // AuthStateType - Raw state enum

  // Actions
  login, // (returnTo?: string) => Promise<void>
  register, // (returnTo?: string) => Promise<void>
  logout, // (returnTo?: string) => Promise<void>
  recoverPassword, // (email: string) => Promise<void>

  // Permission checks
  hasPermission, // (permission: keyof UserPermissions) => boolean
  hasRole, // (role: UserRole | UserRole[]) => boolean
  hasAnyRole, // (roles: UserRole[]) => boolean
} = useAuth();
```

### useAuthUser()

Get current user with loading state.

```tsx
const { user, isLoading, isAuthenticated } = useAuthUser();
```

### useRequiredAuthUser()

Get current user, throws if not authenticated. Use in protected routes.

```tsx
const { user, isLoading } = useRequiredAuthUser();
// user is guaranteed to be non-null
```

### useAuthSession()

Access session management functions.

```tsx
const {
  session, // AuthSession | null
  sessionState, // SessionStateType | null
  isLoading, // boolean
  getAccessToken, // () => Promise<string | null>
  refresh, // () => Promise<void>
} = useAuthSession();
```

### useAuthFlow() / useLoginFlow() / useRegistrationFlow()

Manage authentication flows.

```tsx
const {
  flowState, // FlowState<LoginFlow>
  createFlow, // () => Promise<void>
  submitFlow, // (data: LoginSubmission) => Promise<void>
  resetFlow, // () => void
  isLoading, // boolean
  isSubmitting, // boolean
} = useLoginFlow({ autoCreate: true });

// Submit login
await submitFlow({
  identifier: 'user@example.com',
  password: 'password123',
});
```

## Convex Integration

### Server-Side Helpers

```typescript
// convex/users.ts
import {
  hasRole,
  requireAdmin,
  requireAuth,
  requireRole,
} from '@open-insights-web/foundation-auth/convex';

import { mutation, query } from './_generated/server';

// Require any authenticated user
export const getProfile = query({
  handler: async (ctx) => {
    const identity = await requireAuth(ctx);
    return { userId: identity.subject, email: identity.email };
  },
});

// Require specific roles
export const updateSettings = mutation({
  handler: async (ctx, args) => {
    await requireRole(ctx, ['admin', 'owner']);
    // Only admins and owners reach here
  },
});

// Convenience for admin-only
export const deleteUser = mutation({
  handler: async (ctx, { userId }) => {
    await requireAdmin(ctx);
    // Delete user...
  },
});

// Optional auth (public endpoints)
export const getPublicData = query({
  handler: async (ctx) => {
    const identity = await getOptionalAuth(ctx);
    if (identity) {
      return { data: 'personalized', user: identity.name };
    }
    return { data: 'public' };
  },
});
```

### Auth Configuration

```typescript
// convex/auth.config.ts
import { createOryAuthProvider } from '@open-insights-web/foundation-auth/convex';

export default {
  providers: [
    createOryAuthProvider({
      issuer: process.env.ORY_ISSUER!,
      applicationId: process.env.ORY_APPLICATION_ID!,
    }),
  ],
};
```

## Ory Elements Integration

For pre-built UI components:

```tsx
import { UserAuthCard } from '@ory/elements-react';

import { OryElementsProvider, useOryElementsConfig } from '@open-insights-web/foundation-auth';

const LoginPage = () => {
  const { flowState } = useLoginFlow({ autoCreate: true });

  return (
    <OryElementsProvider
      config={{
        ory: { kratosUrl: 'https://your-project.ory.cloud' },
        styling: { primaryColor: '#0066cc' },
      }}
    >
      {flowState.flow && <UserAuthCard flow={flowState.flow} flowType="login" />}
    </OryElementsProvider>
  );
};
```

## Error Handling

All errors extend `FoundationError` for consistent handling:

```tsx
import {
  AuthError,
  isAuthError,
  isRetryableAuthError,
  isSessionError,
  PermissionDeniedError,
  SessionExpiredError,
} from '@open-insights-web/foundation-auth';

try {
  await someAuthOperation();
} catch (error) {
  if (isSessionError(error)) {
    // Handle session errors (expired, refresh failed, etc.)
    await login();
  } else if (error instanceof PermissionDeniedError) {
    // Handle permission errors
    showAccessDenied();
  } else if (isRetryableAuthError(error)) {
    // Retry the operation
    await retry(someAuthOperation);
  }
}
```

### Error Types

| Error Class               | Description                    |
| ------------------------- | ------------------------------ |
| `AuthNotInitializedError` | Auth provider not initialized  |
| `SessionCheckError`       | Session check failed           |
| `SessionRefreshError`     | Session refresh failed         |
| `SessionExpiredError`     | Session has expired            |
| `LogoutError`             | Logout operation failed        |
| `FlowCreationError`       | Failed to create auth flow     |
| `FlowNotFoundError`       | Auth flow not found            |
| `FlowSubmissionError`     | Failed to submit auth flow     |
| `FlowExpiredError`        | Auth flow has expired          |
| `InvalidCredentialsError` | Invalid login credentials      |
| `PermissionDeniedError`   | User lacks required permission |
| `TokenRetrievalError`     | Failed to get access token     |
| `TokenExpiredError`       | Access token expired           |

## Token Utilities

```typescript
import {
  decodeJwt,
  getTimeUntilExpiration,
  getUserIdFromToken,
  isTokenExpired,
} from '@open-insights-web/foundation-auth';

// Decode JWT (without verification)
const decoded = decodeJwt(accessToken);
console.log(decoded?.payload.sub); // User ID

// Check expiration
if (isTokenExpired(accessToken, 60_000)) {
  // Token expires within 1 minute
  await refreshToken();
}

// Get time until expiration
const msRemaining = getTimeUntilExpiration(accessToken);
```

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        AuthProvider                             │
├──────────────────────────┬──────────────────────────────────────┤
│      AuthContext         │         AuthInternalsContext         │
│      (Public API)        │         (Internal API)               │
├──────────────────────────┴──────────────────────────────────────┤
│                        AuthContainer                            │
├─────────────────────────────────────────────────────────────────┤
│                         AuthFacade                              │
├─────────────────┬─────────────────┬─────────────────────────────┤
│  SessionService │   FlowService   │       UserService           │
├─────────────────┴─────────────────┴─────────────────────────────┤
│                         OryClient                               │
│                    (FrontendApi, OAuth2Api)                     │
└─────────────────────────────────────────────────────────────────┘
```

## Type Reference

### AuthUser

```typescript
interface AuthUser {
  id: string; // Ory identity ID
  email: string; // User's email
  name: string | null; // Display name
  firstName: string | null;
  lastName: string | null;
  avatarUrl: string | null;
  role: UserRole; // 'owner' | 'admin' | 'member' | 'viewer' | 'guest'
  tenantId: string | null;
  permissions: UserPermissions;
  emailVerified: boolean;
  identity: TypedIdentity; // Raw Ory identity
}
```

### UserPermissions

```typescript
interface UserPermissions {
  canManageUsers: boolean;
  canManageTenant: boolean;
  canViewAnalytics: boolean;
  canExportData: boolean;
  canConfigureIntegrations: boolean;
}
```

## Troubleshooting

### Session not persisting

Ensure your Ory project has CORS configured for your domain and cookies are being set correctly. The library uses `credentials: 'include'` for all requests.

### Flow expired errors

Auth flows have a limited lifetime (default 30 minutes). If a flow expires, create a new one:

```tsx
const { flowState, createFlow } = useLoginFlow();

if (flowState.state === 'expired') {
  await createFlow(); // Creates a new flow
}
```

### Token retrieval returns null

For cookie-based authentication (default with Ory Kratos), `getAccessToken()` returns `null` because authentication is handled via cookies. Tokens are only available when using Ory Hydra for OAuth2/OIDC.

## License

MIT
