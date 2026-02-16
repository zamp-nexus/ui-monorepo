# Foundation HTTP

Enterprise-grade HTTP client library built on Axios with automatic token injection, retry with exponential backoff, typed error handling, and React integration via a dual-context provider pattern.

## Table of Contents

- [Overview](#overview)
- [Architecture](#architecture)
- [Quick Start](#quick-start)
- [Configuration](#configuration)
  - [HttpClientConfig](#httpclientconfig)
  - [AuthConfig](#authconfig)
  - [HttpRetryConfig](#httpretryconfig)
  - [ClientHeadersConfig](#clientheadersconfig)
- [React Integration](#react-integration)
  - [HttpProvider](#httpprovider)
  - [useHttp Hook](#usehttp-hook)
  - [Provider Composition](#provider-composition)
- [Interceptors](#interceptors)
  - [Request Interceptors](#request-interceptors)
  - [Response Interceptors](#response-interceptors)
  - [Execution Order](#interceptor-execution-order)
- [Error Handling](#error-handling)
  - [Error Hierarchy](#error-hierarchy)
  - [FoundationErrorCode Mapping](#foundationerrorcode-mapping)
  - [Type Guards](#type-guards)
  - [Error Recovery Patterns](#error-recovery-patterns)
- [Advanced Usage](#advanced-usage)
  - [Instance Manager](#instance-manager)
  - [Custom Interceptors](#custom-interceptors)
  - [Internal Hooks](#internal-hooks)
- [Integration with Sibling Libraries](#integration-with-sibling-libraries)
- [API Reference](#api-reference)
- [Best Practices](#best-practices)
- [Troubleshooting](#troubleshooting)

---

## Overview

Foundation HTTP provides a centralized, enterprise-grade HTTP client that standardises how HTTP requests are made across the application. It replaces fragmented HTTP patterns (raw fetch, global axios) with a consistent, configurable, and observable solution.

### Why Foundation HTTP?

| Problem                                 | Solution                                     |
| --------------------------------------- | -------------------------------------------- |
| Inconsistent auth token injection       | Automatic token injection via interceptor    |
| No retry logic for transient failures   | Exponential backoff with configurable retry  |
| Scattered error handling                | Typed error hierarchy with type guards       |
| No request tracking                     | Automatic X-Request-ID and client headers    |
| Configuration duplication               | Centralised configuration via React provider |
| Memory leaks from dangling interceptors | Full lifecycle management with cleanup       |

### Design Principles

- **Zero duplicate code** — shared utilities (`sleep`, `calculateBackoffDelay`, `generateId`) imported from `foundation-utils`; `HttpMethod` type lives in `foundation-data-model`.
- **No abstraction leaks** — Axios internals (`isAxiosError`, `AxiosError`) are NOT part of the public API. Consumers only work with `HttpError` subclasses.
- **Proper error mapping** — each `HttpError` subclass maps to its own `FoundationErrorCode` (e.g. `HttpTimeoutError` → `NETWORK_TIMEOUT`, `HttpNotFoundError` → `RESOURCE_NOT_FOUND`).
- **Type-safe nullable context** — `useHttp().axios` is `AxiosInstance | null`. No unsafe `null as unknown as AxiosInstance` casts.
- **Const-derived types** — all string union types use the `const` object + `typeof` pattern (e.g. `HTTP_ERROR_CODE` / `HttpErrorCode`).

---

## Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│                         HttpProvider                              │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │                     Axios Instance                          │  │
│  │  ┌──────────────────────────────────────────────────────┐  │  │
│  │  │           Request Interceptors (LIFO)                 │  │  │
│  │  │  ┌─────────┐   ┌─────────┐   ┌────────┐              │  │  │
│  │  │  │ Headers │ → │ Params  │ → │  Auth  │              │  │  │
│  │  │  └─────────┘   └─────────┘   └────────┘              │  │  │
│  │  └──────────────────────────────────────────────────────┘  │  │
│  │                          ↓                                  │  │
│  │             [HTTP Request via XMLHttpRequest]                │  │
│  │                          ↓                                  │  │
│  │  ┌──────────────────────────────────────────────────────┐  │  │
│  │  │          Response Interceptors (FIFO)                 │  │  │
│  │  │  ┌───────┐   ┌──────────┐   ┌──────────────┐         │  │  │
│  │  │  │ Retry │ → │ Unauth   │ → │ Error        │         │  │  │
│  │  │  │       │   │ Handler  │   │ Normalizer   │         │  │  │
│  │  │  └───────┘   └──────────┘   └──────────────┘         │  │  │
│  │  └──────────────────────────────────────────────────────┘  │  │
│  └────────────────────────────────────────────────────────────┘  │
│                                                                    │
│  ┌──────────────────┐    ┌──────────────────────┐                │
│  │   HttpContext     │    │ HttpInternalsContext  │                │
│  │   (Public API)    │    │   (Internal API)      │                │
│  └──────────────────┘    └──────────────────────┘                │
└──────────────────────────────────────────────────────────────────┘
```

### Directory Structure

```
libs/foundation/http/src/
├── index.ts                    # Public exports
├── internal.ts                 # Internal exports for sibling libs
│
├── core/
│   ├── types.ts               # Core interfaces and types
│   └── constants.ts           # Defaults, headers, status codes, error codes
│
├── instance/
│   ├── axios-factory.ts       # createAxiosInstance, resolveHttpConfig
│   └── instance-manager.ts    # Singleton instance management
│
├── interceptors/
│   ├── setup.ts               # Orchestrates interceptor registration
│   ├── request/
│   │   ├── auth-interceptor.ts      # Token injection
│   │   ├── headers-interceptor.ts   # X-Request-ID, X-Client-* headers
│   │   └── params-interceptor.ts    # Query param cleaning / serialisation
│   └── response/
│       ├── error-normalizer.ts      # AxiosError / non-2xx → HttpError
│       ├── unauthorized-handler.ts  # 401/403 callback
│       └── retry-interceptor.ts     # Exponential backoff retry
│
├── errors/
│   ├── http-errors.ts         # HttpError hierarchy
│   └── type-guards.ts         # isHttpError, isHttpTimeoutError, …
│
├── provider/
│   ├── http-context.ts        # Public HttpContext
│   ├── http-internals-context.ts # Internal context
│   └── http-provider.tsx      # HttpProvider component
│
└── hooks/
    ├── use-http.ts            # Main public hook
    └── use-http-internals.ts  # Internal hook
```

---

## Quick Start

### 1. Wrap your app with HttpProvider

```tsx
import { HttpProvider } from '@open-insights-web/foundation-http';

const App = () => (
  <HttpProvider
    config={{
      baseUrl: 'https://api.example.com',
      timeout: 30_000,
      auth: { enabled: true },
    }}
    authInternals={{
      getAccessToken: () => authService.getAccessToken(),
    }}
  >
    <YourApp />
  </HttpProvider>
);
```

### 2. Use in components

```tsx
import { useHttp } from '@open-insights-web/foundation-http';

const UserList = () => {
  const { axios, isInitialized } = useHttp();

  if (!isInitialized || !axios) return <Loading />;

  const fetchUsers = async () => {
    const response = await axios.get('/users');
    return response.data;
  };

  // …
};
```

---

## Configuration

### HttpClientConfig

```typescript
interface HttpClientConfig {
  readonly baseUrl: string;
  readonly timeout?: number; // default: 30_000
  readonly withCredentials?: boolean; // default: false
  readonly defaultHeaders?: Record<string, string>;
  readonly clientHeaders?: ClientHeadersConfig;
  readonly retry?: Partial<HttpRetryConfig>;
  readonly auth?: Partial<AuthConfig>;
  readonly debug?: boolean; // default: false
}
```

### AuthConfig

```typescript
interface AuthConfig {
  readonly enabled: boolean;
  readonly getAccessToken?: () => Promise<string | null>;
  readonly onUnauthorized?: (statusCode: number, url?: string) => void;
  readonly tokenType?: string; // default: 'Bearer'
}
```

The `onUnauthorized` callback receives the HTTP status code (401 or 403) and the request URL. No mock response objects are constructed.

### HttpRetryConfig

```typescript
interface HttpRetryConfig {
  readonly enabled: boolean;
  readonly maxRetries: number;
  readonly initialDelayMs: number;
  readonly maxDelayMs: number;
  readonly backoffMultiplier: number;
  readonly retryableStatusCodes: readonly number[];
  readonly retryOnNetworkError: boolean;
}
```

Default values (`DEFAULT_HTTP_RETRY_CONFIG`):

| Field                  | Default                          |
| ---------------------- | -------------------------------- |
| `enabled`              | `true`                           |
| `maxRetries`           | `3`                              |
| `initialDelayMs`       | `1000`                           |
| `maxDelayMs`           | `30_000`                         |
| `backoffMultiplier`    | `2`                              |
| `retryableStatusCodes` | `[408, 429, 500, 502, 503, 504]` |
| `retryOnNetworkError`  | `true`                           |

### ClientHeadersConfig

```typescript
interface ClientHeadersConfig {
  readonly clientId?: string;
  readonly clientVersion?: string;
  readonly platform?: string;
  readonly sessionId?: string | (() => string);
}
```

---

## React Integration

### HttpProvider

```tsx
<HttpProvider
  config={httpConfig}
  authInternals={{ getAccessToken: () => authService.getAccessToken() }}
>
  {children}
</HttpProvider>
```

| Prop            | Type                 | Required | Description               |
| --------------- | -------------------- | -------- | ------------------------- |
| `config`        | `HttpClientConfig`   | Yes      | HTTP client configuration |
| `children`      | `ReactNode`          | Yes      | Child components          |
| `authInternals` | `{ getAccessToken }` | No       | Auth token provider       |

### useHttp Hook

```typescript
const { axios, isInitialized, baseUrl } = useHttp();
```

| Property        | Type                    | Description                            |
| --------------- | ----------------------- | -------------------------------------- |
| `axios`         | `AxiosInstance \| null` | Configured instance (null before init) |
| `isInitialized` | `boolean`               | Whether the client is ready            |
| `baseUrl`       | `string`                | The configured base URL                |

### Provider Composition

```tsx
<AuthProvider config={authConfig}>
  <HttpProvider config={httpConfig} authInternals={{ getAccessToken }}>
    <DataLayerProvider config={dlConfig}>
      <AppRoutes />
    </DataLayerProvider>
  </HttpProvider>
</AuthProvider>
```

1. **AuthProvider** — manages authentication state, provides `getAccessToken`
2. **HttpProvider** — uses auth token for API requests
3. **DataLayerProvider** — may use HTTP client for sync operations

---

## Interceptors

### Request Interceptors

| Interceptor | Purpose                                                                  |
| ----------- | ------------------------------------------------------------------------ |
| **Headers** | Adds `X-Request-ID` (UUID from `foundation-utils`), `X-Client-*` headers |
| **Params**  | Strips `null`/`undefined` from query parameters                          |
| **Auth**    | Injects `Authorization: Bearer <token>` header                           |

### Response Interceptors

| Interceptor              | Purpose                                                          |
| ------------------------ | ---------------------------------------------------------------- |
| **Retry**                | Retries on retryable status codes and network/timeout errors     |
| **Unauthorized Handler** | Calls `onUnauthorized(statusCode, url)` on 401/403               |
| **Error Normalizer**     | Converts raw AxiosError / non-2xx responses to typed `HttpError` |

### Interceptor Execution Order

Because the axios instance uses `validateStatus: () => true`, **all HTTP responses arrive as fulfilled** (not rejected). Only true transport failures (DNS, timeout, cancelled) arrive as rejections.

```
REQUEST FLOW (LIFO — last registered runs first):
  1. Headers  → adds X-Request-ID, X-Client-*
  2. Params   → strips null/undefined
  3. Auth     → injects freshest token

                    ↓ [XHR Request] ↓

RESPONSE FLOW (FIFO — first registered runs first):
  1. Retry           → checks response.status against retryable codes
                       checks AxiosError codes for network/timeout
  2. Unauth Handler  → calls onUnauthorized on 401/403
  3. Error Normalizer → throws typed HttpError for status >= 400
```

The retry interceptor operates on **raw responses and AxiosErrors**, not on `HttpError` instances. This is critical — `HttpError` instances only exist after the error normalizer runs last.

---

## Error Handling

### Error Hierarchy

```
FoundationError (foundation-data-model)
  └── HttpError (abstract)
        ├── HttpNotInitializedError   CONFIG_MISSING
        ├── HttpConfigError           CONFIG_INVALID
        ├── HttpRequestError          NETWORK_REQUEST_FAILED
        ├── HttpTimeoutError          NETWORK_TIMEOUT
        ├── HttpNetworkError          NETWORK_REQUEST_FAILED
        ├── HttpCancelledError        NETWORK_REQUEST_FAILED
        ├── HttpUnauthorizedError     NETWORK_REQUEST_FAILED
        ├── HttpForbiddenError        NETWORK_REQUEST_FAILED
        ├── HttpNotFoundError         RESOURCE_NOT_FOUND
        ├── HttpServerError           NETWORK_REQUEST_FAILED
        └── HttpSerializationError    VALIDATION_FAILED
```

### FoundationErrorCode Mapping

Each `HttpError` subclass carries two error codes:

- `code` — the `FoundationErrorCode` for cross-library categorisation
- `httpCode` — the `HttpErrorCode` for HTTP-specific granularity

| Error Class               | `FoundationErrorCode`    | `HttpErrorCode`            |
| ------------------------- | ------------------------ | -------------------------- |
| `HttpNotInitializedError` | `CONFIG_MISSING`         | `HTTP_NOT_INITIALIZED`     |
| `HttpConfigError`         | `CONFIG_INVALID`         | `HTTP_CONFIG_ERROR`        |
| `HttpRequestError`        | `NETWORK_REQUEST_FAILED` | `HTTP_REQUEST_FAILED`      |
| `HttpTimeoutError`        | `NETWORK_TIMEOUT`        | `HTTP_TIMEOUT`             |
| `HttpNetworkError`        | `NETWORK_REQUEST_FAILED` | `HTTP_NETWORK_ERROR`       |
| `HttpCancelledError`      | `NETWORK_REQUEST_FAILED` | `HTTP_CANCELLED`           |
| `HttpUnauthorizedError`   | `NETWORK_REQUEST_FAILED` | `HTTP_UNAUTHORIZED`        |
| `HttpForbiddenError`      | `NETWORK_REQUEST_FAILED` | `HTTP_FORBIDDEN`           |
| `HttpNotFoundError`       | `RESOURCE_NOT_FOUND`     | `HTTP_NOT_FOUND`           |
| `HttpServerError`         | `NETWORK_REQUEST_FAILED` | `HTTP_SERVER_ERROR`        |
| `HttpSerializationError`  | `VALIDATION_FAILED`      | `HTTP_SERIALIZATION_ERROR` |

### Error Conversion Table

| Axios Condition              | HttpError Class         |
| ---------------------------- | ----------------------- |
| `ERR_CANCELED`               | `HttpCancelledError`    |
| `ECONNABORTED` / `ETIMEDOUT` | `HttpTimeoutError`      |
| `ERR_NETWORK` / no response  | `HttpNetworkError`      |
| Status 401                   | `HttpUnauthorizedError` |
| Status 403                   | `HttpForbiddenError`    |
| Status 404                   | `HttpNotFoundError`     |
| Status 5xx                   | `HttpServerError`       |
| Other 4xx                    | `HttpRequestError`      |

### Type Guards

```typescript
import {
  isAuthenticationError,
  isHttpError,
  isHttpTimeoutError,
  isHttpUnauthorizedError,
  isRetryableHttpError,
} from '@open-insights-web/foundation-http';

try {
  await axios.get('/data');
} catch (error) {
  if (isHttpTimeoutError(error)) {
    // error is HttpTimeoutError — access error.timeoutMs
  } else if (isHttpUnauthorizedError(error)) {
    // redirect to login
  } else if (isRetryableHttpError(error)) {
    // could retry manually
  }
}
```

### Error Recovery Patterns

#### Graceful Degradation

```typescript
try {
  return (await axios.get(`/users/${id}`)).data;
} catch (error) {
  if (isHttpNotFoundError(error)) {
    return { id, name: 'Unknown', isDefault: true };
  }
  throw error;
}
```

#### AbortController Cancellation

```typescript
useEffect(() => {
  const controller = new AbortController();

  axios
    .get('/data', { signal: controller.signal })
    .then((res) => setData(res.data))
    .catch((err) => {
      if (!isHttpCancelledError(err)) setError(err);
    });

  return () => controller.abort();
}, [axios]);
```

---

## Advanced Usage

### Instance Manager

For applications with multiple API endpoints:

```typescript
import { getDefaultAxiosInstance, httpInstanceManager } from '@open-insights-web/foundation-http';

httpInstanceManager.createInstance({ baseUrl: 'https://api.example.com' }, 'main-api', {
  setAsDefault: true,
});

httpInstanceManager.createInstance({ baseUrl: 'https://analytics.example.com' }, 'analytics-api');

const mainAxios = getDefaultAxiosInstance();
const analyticsAxios = httpInstanceManager.getInstance('analytics-api')?.instance;
```

Removing an instance properly ejects all interceptors:

```typescript
httpInstanceManager.removeInstance('analytics-api');
httpInstanceManager.clear(); // removes all
```

### Internal Hooks

For sibling foundation libraries (import from `/internal`):

```typescript
import { useHttpInternals } from '@open-insights-web/foundation-http/internal';

const { axios, config, getAccessToken } = useHttpInternals();
```

---

## Integration with Sibling Libraries

### With foundation-auth

```tsx
import { AuthProvider, useAuthInternals } from '@open-insights-web/foundation-auth';
import { HttpProvider } from '@open-insights-web/foundation-http';

const HttpProviderWithAuth = ({ children }) => {
  const { getAccessToken } = useAuthInternals();
  return (
    <HttpProvider config={httpConfig} authInternals={{ getAccessToken }}>
      {children}
    </HttpProvider>
  );
};
```

### With React Query

```typescript
import { useQuery } from '@tanstack/react-query';

import { isHttpNotFoundError, useHttp } from '@open-insights-web/foundation-http';

const useUser = (userId: string) => {
  const { axios, isInitialized } = useHttp();

  return useQuery({
    queryKey: ['user', userId],
    queryFn: async () => (await axios!.get(`/users/${userId}`)).data,
    enabled: isInitialized && !!userId,
    retry: (count, error) => !isHttpNotFoundError(error) && count < 3,
  });
};
```

---

## API Reference

### Public Exports (`@open-insights-web/foundation-http`)

**Types:** `HttpClientConfig`, `HttpRetryConfig`, `AuthConfig`, `ClientHeadersConfig`, `ResolvedHttpConfig`, `HttpContextValue`, `HttpProviderProps`, `HttpMethod`

**Constants:** `DEFAULT_TIMEOUT_MS`, `UPLOAD_TIMEOUT_MS`, `DOWNLOAD_TIMEOUT_MS`, `DEFAULT_HTTP_RETRY_CONFIG`, `DEFAULT_AUTH_CONFIG`, `HTTP_HEADERS`, `CLIENT_HEADERS`, `CONTENT_TYPES`, `HTTP_STATUS`, `HTTP_ERROR_CODE` / `HttpErrorCode`, `PARAMS_ARRAY_FORMAT` / `ParamsArrayFormat`, `SERIALIZATION_OPERATION` / `SerializationOperation`, `AXIOS_ERROR_CODE`

**Components:** `HttpProvider`

**Hooks:** `useHttp`, `useHttpContext`

**Errors:** `HttpError`, `HttpNotInitializedError`, `HttpRequestError`, `HttpTimeoutError`, `HttpNetworkError`, `HttpCancelledError`, `HttpUnauthorizedError`, `HttpForbiddenError`, `HttpNotFoundError`, `HttpServerError`, `HttpConfigError`, `HttpSerializationError`

**Type Guards:** `isHttpError`, `hasHttpErrorCode`, `isHttpNotInitializedError`, `isHttpRequestError`, `isHttpTimeoutError`, `isHttpNetworkError`, `isHttpCancelledError`, `isHttpUnauthorizedError`, `isHttpForbiddenError`, `isHttpNotFoundError`, `isHttpServerError`, `isHttpConfigError`, `isHttpSerializationError`, `isAuthenticationError`, `isClientError`, `isServerError`, `isRetryableHttpError`, `isNonRetryableHttpError`

**Instance Management:** `createAxiosInstance`, `createConfiguredAxiosInstance`, `resolveHttpConfig`, `httpInstanceManager`, `getDefaultAxiosInstance`, `getAxiosInstance`

### Internal Exports (`@open-insights-web/foundation-http/internal`)

All public exports, plus:

**Types:** `HttpInternals`

**Hooks:** `useHttpInternals`, `useGetAccessToken`, `useHttpInternalsContext`

**Contexts:** `HttpInternalsContext`

**Interceptors:** `setupInterceptors`, `removeInterceptors`, `InterceptorIds`, `SetupInterceptorsOptions`, plus individual `create*Interceptor` / `setup*Interceptor` functions with their option types, and utilities `convertAxiosError`, `convertResponseError`, `getRetryCount`, `getRetryDuration`

---

## Best Practices

1. **Always guard on `isInitialized` or `axios !== null`** before making requests.
2. **Use type guards** (`isHttpUnauthorizedError`, etc.) instead of checking `statusCode` manually.
3. **Use `UPLOAD_TIMEOUT_MS` / `DOWNLOAD_TIMEOUT_MS`** for long-running operations.
4. **Let the retry interceptor handle transient failures** — avoid manual retry loops for standard API calls.
5. **Use `AbortController`** to cancel requests on component unmount.
6. **Never import Axios internals** (`isAxiosError`, `AxiosError`) in application code — work with `HttpError` subclasses exclusively.

---

## Troubleshooting

### "HTTP client not initialized"

Using `useHttp` outside of `HttpProvider` or before initialisation completes.

```tsx
<HttpProvider config={config}>
  <YourComponent /> {/* must be a child */}
</HttpProvider>
```

### Auth token not being sent

Ensure `auth.enabled` is `true` **and** `getAccessToken` is provided (either in `config.auth` or via `authInternals` prop).

### Requests not being retried

- Verify `retry.enabled` is `true`.
- Check that the failing status code is in `retryableStatusCodes`.
- 4xx errors (except 408, 429) are **not** retried by design.
- Cancelled requests are **never** retried.

### CORS errors

If sending credentials, the backend must respond with:

```
Access-Control-Allow-Origin: <specific-origin>  (not *)
Access-Control-Allow-Credentials: true
Access-Control-Allow-Headers: X-Request-ID, X-Client-ID, Authorization, …
```

---

## Peer Dependencies

```json
{
  "axios": "^1.x",
  "react": "^18.x || ^19.x"
}
```

---

Internal library — part of the Open Insights Web monorepo.
