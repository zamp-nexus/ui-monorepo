# Foundation Data Layer

Enterprise-grade React data layer for Open Insights combining real-time Convex subscriptions, offline-first persistence, mutation orchestration, and in-browser DuckDB analytics.

## Table of Contents

- [Overview](#overview)
- [Architecture](#architecture)
- [Installation](#installation)
- [Quick Start](#quick-start)
- [Configuration Reference](#configuration-reference)
- [Public API](#public-api)
- [Advanced Usage](#advanced-usage)
- [Performance](#performance)
- [Troubleshooting](#troubleshooting)
- [Development](#development)
- [Contributing](#contributing)

---

## Overview

The Foundation Data Layer library orchestrates data flow across four foundation libraries into a single, cohesive provider:

| Dependency | Role |
|---|---|
| `foundation-database` | IndexedDB persistence via `DatabaseFacade` |
| `foundation-sync-engine` | Offline mutation queue, conflict resolution, cross-tab sync |
| `foundation-bridge` | In-browser DuckDB for analytics SQL queries |
| `foundation-data-model` | Shared types, branded IDs, error hierarchy, query keys |

**Key Capabilities:**

- **Real-time subscriptions** via Convex WebSocket queries
- **Offline-first** with automatic cache fallback and mutation queueing
- **Optimistic updates** with automatic rollback on failure
- **Conflict resolution** with local/remote/merge strategies
- **In-browser analytics** via DuckDB (lazy-initialized)
- **Background file sync** for Parquet data files
- **Cross-tab coordination** with leader election
- **Unified table registry** as single source of truth

---

## Architecture

### Component Composition

```
DataLayerProvider
├── DataLayerContainer (composition root)
│   ├── ConvexReactClient (WebSocket connection)
│   ├── ConvexQueryClient (TanStack Query bridge)
│   ├── QueryClient (TanStack Query cache)
│   ├── DatabaseFacade (IndexedDB persistence)
│   ├── SyncCoordinator (offline sync orchestration)
│   ├── TableRegistry (unified table metadata)
│   └── Analytics Runtime (lazy)
│       ├── DuckDBRouter (SQL query routing)
│       └── OpfsManager (OPFS file management)
├── DataLayerContext (public state)
│   └── isOnline, isSyncing, pendingSyncCount, syncNow, clearCache
└── DataLayerInternalsContext (hook infrastructure)
    └── database, syncCoordinator, duckdbRouter, tableRegistry, ...
```

### Data Flow

**Online Path:**
1. Hook calls Convex query via TanStack Query
2. Convex WebSocket delivers live updates
3. Data persisted to IndexedDB for offline access

**Offline Path:**
1. Hook reads from IndexedDB cache
2. Mutations queued in SyncCoordinator
3. On reconnect, queue is processed with conflict resolution

**Analytics Path:**
1. Hook calls DuckDB router (lazy-initialized)
2. DuckDB executes SQL on in-memory/Parquet data
3. Results cached in TanStack Query

### Lifecycle

- `DataLayerContainer.initialize()` is idempotent — multiple calls return the same dependencies.
- `DataLayerContainer.dispose()` is async, mutex-protected, and idempotent — safe to call from React cleanup effects.
- The analytics runtime (DuckDB + OPFS) is **lazily initialized** only when the first analytics hook executes.

---

## Installation

```bash
npm install @open-insights-web/foundation-data-layer
```

### Peer Dependencies

```bash
npm install @tanstack/react-query convex
```

### Foundation Dependencies

These are workspace dependencies resolved automatically:

- `@open-insights-web/foundation-database`
- `@open-insights-web/foundation-sync-engine`
- `@open-insights-web/foundation-bridge`
- `@open-insights-web/foundation-data-model`
- `@open-insights-web/foundation-utils`

---

## Quick Start

```tsx
import {
  DataLayerProvider,
  useDLGet,
  useDLCreate,
} from '@open-insights-web/foundation-data-layer';
import { ConflictStrategy } from '@open-insights-web/foundation-data-model';
import { api } from '../convex/_generated/api';

const AppProviders = ({ children }: { children: React.ReactNode }) => (
  <DataLayerProvider
    config={{
      convexUrl: process.env['VITE_CONVEX_URL'] ?? '',
      conflictStrategy: ConflictStrategy.LAST_WRITE_WINS,
      enableCrossTab: true,
      enableAnalytics: true,
      tables: [
        {
          name: 'users',
          convex: {
            list: api.users.list,
            get: api.users.get,
            create: api.users.create,
            update: api.users.update,
            delete: api.users.delete,
          },
          staleTime: 5 * 60 * 1000,
          analytics: { enabled: true },
        },
      ],
    }}
    loadingComponent={<div>Loading...</div>}
    errorComponent={(error) => <div>Error: {error.message}</div>}
  >
    {children}
  </DataLayerProvider>
);

const UsersScreen = () => {
  // Query with real-time Convex subscription + offline fallback
  const { data: users, isLoading, isOffline, dataSource } = useDLGet({
    query: api.users.list,
    args: {},
    table: 'users',
  });

  // Create with optimistic updates + offline queueing
  const createUser = useDLCreate({
    mutation: api.users.create,
    table: 'users',
    listQueryKey: ['users'],
    onOptimistic: (vars) => ({
      ...vars,
      id: 'provisional',
      createdAt: new Date().toISOString(),
    }),
  });

  if (isLoading) return <div>Loading...</div>;

  return (
    <div>
      {isOffline && <span>Offline mode (data from {dataSource})</span>}
      <button onClick={() => createUser.mutate({ name: 'Ada' })}>
        Create user ({users?.length ?? 0})
      </button>
    </div>
  );
};
```

---

## Configuration Reference

### `DataLayerConfig`

| Property | Type | Default | Description |
|---|---|---|---|
| `convexUrl` | `string` | **required** | Convex deployment URL |
| `tables` | `UnifiedTableConfig[]` | `[]` | Table configurations (single source of truth) |
| `datasourceApi` | `AnyFunctionReference` | — | Convex query for background file sync |
| `conflictStrategy` | `ConflictStrategy` | `LAST_WRITE_WINS` | Global conflict resolution strategy |
| `enableCrossTab` | `boolean` | `true` | Enable cross-tab sync coordination |
| `enableAnalytics` | `boolean` | `true` | Enable DuckDB analytics runtime |
| `defaultStaleTime` | `number` | `300000` (5 min) | Default query stale time in ms |
| `defaultGcTime` | `number` | `86400000` (24 hr) | Default query GC time in ms |
| `cache` | `CacheConfig` | — | Cache configuration overrides |
| `debug` | `boolean` | `false` | Enable debug logging |
| `onSyncError` | `(error, context?) => void` | — | Sync error callback |

### `UnifiedTableConfig`

| Property | Type | Description |
|---|---|---|
| `name` | `string` | Table name (unique identifier) |
| `convex` | `object` | Convex function references (`list`, `get`, `create`, `update`, `delete`) |
| `staleTime` | `number` | Per-table stale time override (ms) |
| `gcTime` | `number` | Per-table GC time override (ms) |
| `conflictStrategy` | `ConflictStrategy` | Per-table conflict resolution |
| `mergeConfig` | `object` | Field-level merge rules for `MERGE` strategy |
| `analytics` | `TableAnalyticsConfig` | DuckDB configuration (`enabled`, `freshness`, `staleTime`) |

### `CacheConfig`

| Property | Type | Default | Description |
|---|---|---|---|
| `defaultStaleTime` | `number` | `300000` | Default stale time |
| `defaultGcTime` | `number` | `86400000` | Default GC time |
| `analyticsStaleTime` | `number` | `600000` | Analytics stale time |
| `analyticsGcTime` | `number` | `3600000` | Analytics GC time |

---

## Public API

Use `src/index.ts` exports as the canonical API.

### Provider

| Export | Description |
|---|---|
| `DataLayerProvider` | Root provider component |
| `useDataLayer` | Public context hook (isOnline, isSyncing, syncNow, clearCache) |
| `DataLayerContext` | React context for public state |

### Query Hooks

| Hook | Description |
|---|---|
| `useDLGet` | Query with Convex real-time + offline cache fallback |
| `useDLGetList` | Simplified list query (no entityId) |
| `useDLGetOne` | Simplified single-item query (entityId required) |

### Mutation Hooks

| Hook | Description |
|---|---|
| `useDLCreate` | Create with optimistic add + offline queue |
| `useDLUpdate` | Update with optimistic modify + offline queue |
| `useDLDelete` | Delete with optimistic remove + offline queue |

### Analytics Hooks

| Hook | Description |
|---|---|
| `useDLAnalytics` | DuckDB SQL query hook |
| `useDLAnalyticsMutation` | DuckDB write operations |
| `useCreateAnalyticsView` | Create/replace DuckDB views |
| `useDropAnalyticsView` | Drop DuckDB views |
| `useExecuteAnalyticsSql` | Execute raw DuckDB SQL |
| `useLoadParquetFile` | Load Parquet files into DuckDB |
| `useCopyToParquet` | Export query results to Parquet |

### Sync and Conflict Hooks

| Hook | Description |
|---|---|
| `useSyncStatus` | Monitor sync state (online, syncing, pending count, leader) |
| `useSyncTrigger` | Trigger manual sync |
| `useSyncEventListener` | Listen for specific sync events |
| `useConflictResolution` | Manage and resolve sync conflicts |
| `useEntityConflict` | Check if a specific entity has conflicts |
| `useConflicts` | Read-only conflicts list |

### Convenience Hooks

| Hook | Description |
|---|---|
| `useIsOnline` | Network online status |
| `useIsDuckDBAvailable` | DuckDB availability |
| `usePendingMutationCount` | Pending offline mutation count |
| `useBackgroundFileSync` | Background Parquet file synchronization |

### Core Exports

| Export | Description |
|---|---|
| `TableRegistry` / `createTableRegistry` | Unified table metadata registry |
| `DataLayerContainer` / `createDataLayerContainer` | Dependency injection container |
| `DATA_FRESHNESS` | Analytics freshness level constants |
| `DEFAULT_CACHE_CONFIG` / `DEFAULT_RETRY_CONFIG` | Default configurations |
| `CONFLICT_RESOLUTION_TYPE` | Conflict resolution discriminants |

---

## Advanced Usage

### Offline-First Mutations

All mutation hooks automatically handle offline scenarios:

```tsx
const updateUser = useDLUpdate({
  mutation: api.users.update,
  table: 'users',
  getEntityId: (vars) => vars.id,
  onOptimistic: (vars, prev) => ({ ...prev, ...vars, updatedAt: new Date().toISOString() }),
  listQueryKey: ['users'],
  itemQueryKey: (id) => ['users', id],
  invalidateKeys: [['users']],
});

// Works online AND offline
updateUser.mutate({ id: '123', name: 'Jane' });

// Check if mutation was queued (offline)
if (updateUser.isQueued) {
  showToast('Change saved locally. Will sync when online.');
}
```

### Conflict Resolution UI

```tsx
const ConflictManager = () => {
  const {
    conflicts,
    hasConflicts,
    resolveConflict,
    resolveAll,
    dismissAll,
  } = useConflictResolution();

  if (!hasConflicts) return null;

  return (
    <div>
      <h3>{conflicts.length} conflict(s) detected</h3>
      {conflicts.map((conflict) => (
        <div key={conflict.id}>
          <p>Table: {conflict.tableName}, Entity: {conflict.entityId}</p>
          <button onClick={() => resolveConflict(conflict.id, { type: 'accept-local' })}>
            Keep Local
          </button>
          <button onClick={() => resolveConflict(conflict.id, { type: 'accept-remote' })}>
            Use Server
          </button>
        </div>
      ))}
      <button onClick={() => resolveAll({ type: 'accept-remote' })}>
        Accept All Server Changes
      </button>
    </div>
  );
};
```

### DuckDB Analytics Pipeline

```tsx
const AnalyticsDashboard = () => {
  // Load Parquet data into DuckDB
  const loadEvents = useLoadParquetFile();

  // Query aggregated data
  const { rows, isLoading } = useDLAnalytics({
    sql: `SELECT DATE_TRUNC('day', timestamp) as date, COUNT(*) as count
          FROM events
          GROUP BY date
          ORDER BY date DESC
          LIMIT 30`,
    queryKey: ['analytics', 'dailyEvents'],
  });

  // Background sync for Parquet files
  const { isDownloading, downloadProgress, triggerSync } = useBackgroundFileSync({
    tables: ['events', 'sessions'],
    enabled: true,
    onComplete: (tables) => console.log('Synced:', tables),
  });

  return (
    <div>
      {isDownloading && <ProgressBar value={downloadProgress.progress} />}
      <Chart data={rows} />
    </div>
  );
};
```

### Background File Sync

```tsx
const { triggerSync, isDownloading, downloadProgress, isConfigured } = useBackgroundFileSync({
  tables: ['events', 'sessions', 'users'],
  enabled: true,
  onProgress: (progress) => {
    console.log(`${progress.filesCompleted}/${progress.filesTotal} files`);
  },
  onComplete: (updatedTables) => {
    // Tables are now available in DuckDB
    toast.success(`Updated: ${updatedTables.join(', ')}`);
  },
  onError: (error) => {
    toast.error(`Sync failed: ${error.message}`);
  },
});
```

### Custom Container (Advanced)

For testing or advanced composition:

```typescript
import {
  DataLayerContainer,
  createDataLayerContainer,
} from '@open-insights-web/foundation-data-layer';

const container = createDataLayerContainer({
  convexUrl: 'https://my-app.convex.cloud',
  tables: [...],
  factories: {
    // Override for testing
    database: () => mockDatabaseFacade,
    syncCoordinator: (config) => mockSyncCoordinator,
  },
});

const deps = await container.initialize();
// Use deps.queryClient, deps.database, etc.

// Cleanup
await container.dispose();
```

---

## Performance

### Lazy Analytics Initialization

The DuckDB runtime (WebAssembly + workers) is only loaded when the first analytics hook executes. This keeps the initial provider mount fast.

### Concurrent File Downloads

`FileDownloadService` downloads Parquet files with configurable concurrency (default: 3 concurrent downloads). This significantly reduces sync time for tables with many files.

### Optimistic Update Strategy

Mutations use a fire-and-forget pattern for cache persistence. The IndexedDB write happens asynchronously after the optimistic update, avoiding blocking the UI thread.

### Memory Management

- **TanStack Query GC**: Unused cache entries are garbage collected after `gcTime` (default: 24 hours).
- **Database cleanup**: `DatabaseFacade.startCleanup()` runs periodic cleanup of expired entries.
- **Sync event subscriptions**: All subscriptions are properly unsubscribed in cleanup effects.
- **Container disposal**: Mutex-protected async disposal ensures all resources are released in order.

### Tips

- Set per-table `staleTime` and `gcTime` based on data volatility.
- Use `DATA_FRESHNESS.EVENTUAL` for tables where DuckDB analytics are preferred over API calls.
- Keep `enableAnalytics: false` if you don't use DuckDB to avoid loading the WASM runtime.
- Use `useBackgroundFileSync` for large datasets rather than loading Parquet files on-demand.

---

## Troubleshooting

### "DataLayerProvider not initialized"

The `useDataLayer()` or `useDataLayerInternals()` hook was called outside of a `<DataLayerProvider>`. Ensure your component tree includes the provider.

### "Container is disposed"

The container was disposed (typically during React unmount) before an async operation completed. This is usually harmless and can be ignored.

### "DuckDB is not available in this environment"

DuckDB requires WebAssembly support and SharedArrayBuffer. Check:
- Browser supports WASM and SAB
- `enableAnalytics` is not set to `false`
- The analytics runtime initialized successfully (check debug logs with `debug: true`)

### "No datasource API configured"

The `useBackgroundFileSync` hook requires `datasourceApi` in the `DataLayerConfig`. This is a Convex query function that returns Parquet file metadata.

### Stale offline data

If cached data seems outdated:
1. Check `staleTime` and `gcTime` settings
2. Call `clearCache()` from `useDataLayer()` to reset
3. Verify sync is working via `useSyncStatus()`

---

## Development

### Compile

```bash
npx tsc -p libs/foundation/data-layer/tsconfig.lib.json --pretty false
npx tsc -p libs/foundation/data-layer/tsconfig.spec.json --pretty false
```

### Run Tests

```bash
npx vitest run libs/foundation/data-layer/src
```

### Run Tests in Watch Mode

```bash
npx vitest libs/foundation/data-layer/src
```

---

## Contributing

### Code Conventions

- **Strict typing**: No `any`, no unchecked casts. Use `unknown` + type guards.
- **Readonly interfaces**: All exported interface properties must be `readonly`.
- **Constants**: Use `UPPER_SNAKE_CASE` with `as const` objects and derived types.
- **Arrow functions**: Prefer arrow functions for all callbacks and function definitions.
- **Direct imports**: Import from specific modules, not barrel re-exports, in internal code.
- **Centralized defaults**: All default values go in `src/core/constants.ts`.
- **Structured logging**: Use `createDebugLogger` / `createLogger` from `foundation-utils`. No raw `console.*` calls.
- **Error hierarchy**: Custom errors must extend `FoundationError` from `foundation-data-model`.

### Architecture Rules

- `core/` contains types, constants, container, and table registry. No React dependencies.
- `provider/` contains React contexts and the provider component.
- `hooks/` contains React hooks. Each hook file is self-contained with its types.
- `utils/` contains shared utilities used by multiple hooks.
- `analytics-sync/` contains the background file sync pipeline.

### Testing

- Use Vitest with globals enabled.
- Mock external dependencies (Convex, database) via the `factories` config.
- Test files are colocated with source files (`.spec.ts` suffix).
- Focus on behavioral tests over implementation details.
