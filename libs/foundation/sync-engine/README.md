# @open-insights-web/foundation-sync-engine

Offline-first synchronization orchestration for Open Insights foundation libraries.

## Purpose

`foundation-sync-engine` coordinates:

- Network-aware sync scheduling
- Offline mutation queue processing
- Conflict resolution
- Cross-tab leader election and coordination
- Convex mutation execution hooks

It is designed to sit between `foundation-data-layer`/application orchestration and the lower-level storage in `foundation-database`.

## Public API (Root Exports)

The package root intentionally exports a narrow compatibility-stable surface:

```ts
import {
  createSyncCoordinator,
  DEFAULT_MERGE_CONFIG,
  SyncCoordinator,
  type IQueueManager,
} from '@open-insights-web/foundation-sync-engine';
```

Root exports:

- `SyncCoordinator`
- `createSyncCoordinator(config)`
- `IQueueManager` (type)
- `DEFAULT_MERGE_CONFIG`

## Important API Boundary

Most modules under `src/*` are internal implementation details (network manager, queue processor, cross-tab manager, convex adapter, tanstack adapters, etc.).

Deep imports may be used by foundation maintainers, but they are not guaranteed stable for application code.

## Installation

```bash
npm i @open-insights-web/foundation-sync-engine
```

Required peers/dependencies in the workspace:

- `@open-insights-web/foundation-data-model`
- `@open-insights-web/foundation-database`
- `@open-insights-web/foundation-utils`
- `@tanstack/react-query`
- `convex`

## Quick Start

```ts
import { QueryClient } from '@tanstack/react-query';
import { ConvexReactClient } from 'convex/react';

import { CONFLICT_STRATEGY } from '@open-insights-web/foundation-data-model';
import { createSyncCoordinator } from '@open-insights-web/foundation-sync-engine';

const queryClient = new QueryClient();
const convexClient = new ConvexReactClient(import.meta.env.VITE_CONVEX_URL);

const coordinator = createSyncCoordinator({
  queryClient,
  convexClient,
  conflictStrategy: CONFLICT_STRATEGY.LAST_WRITE_WINS,
  enableCrossTab: true,
  autoStart: true,
  debug: false,
  onError: (error, context) => {
    console.error('Sync error', context, error);
  },
});

// Optional explicit lifecycle control
await coordinator.start();
coordinator.stop();
await coordinator.disposeAsync();
```

## Configuration

`createSyncCoordinator` accepts:

- `queryClient` (required): TanStack Query client
- `convexClient` (required): Convex client instance
- `database` (optional): explicit `InsightsDatabase`; default is singleton database
- `conflictStrategy` (optional): `ConflictStrategy` value from `CONFLICT_STRATEGY`
- `mutationMap` (optional): mapping for queue mutation execution
- `autoStart` (optional): when omitted, defaults to engine default (`DEFAULT_AUTO_START`)
- `enableCrossTab` (optional): enable BroadcastChannel-based coordination
- `healthCheckUrl` (optional): connectivity probe URL for network monitor
- `healthCheckInterval` (optional): periodic connectivity check interval
- `debug` (optional): debug logging
- `onError` (optional): centralized error hook

## Lifecycle Semantics

`SyncCoordinator` lifecycle is designed for safe restart cycles:

- `start()` is idempotent.
- `stop()` detaches runtime subscriptions, stops timers/debouncers, and leaves instance reusable.
- `disposeAsync()` performs final cleanup and should be called when the coordinator is no longer needed.

### Restart Safety

`start -> stop -> start` does not duplicate:

- network monitor subscriptions
- cross-tab message subscriptions
- pending sync timers/debouncers

## Architecture

Core runtime collaborators:

- `SyncCoordinator`: orchestration entrypoint
- `NetworkStatusMonitor`: online/offline + health checks
- `OfflineQueueManager`: mutation persistence + ID mapping storage
- `QueueProcessor`: dependency-aware queue processing
- `ConflictResolver`: strategy-driven conflict handling
- `CrossTabManager`: leader election/heartbeats over `BroadcastChannel`
- `ConvexSyncAdapter`: mutation/query execution wrapper for Convex

### Queue Processing Guarantees

Queue processing now includes:

- dependency ordering via topological sorting
- deadlock/cycle detection with explicit failure marking
- deterministic failure reasons for unprocessable mutations
- awaited ID-mapping persistence during processing

### ID Mapping Pipeline

Provisional IDs (`provisional_*`) are:

- persisted in queue manager state
- loaded before processing via guaranteed initialization
- resolved recursively in nested payloads (objects + arrays)

## Conflict Resolution

Conflict contracts come from `foundation-data-model`:

- `CONFLICT_STRATEGY` + `type ConflictStrategy`
- `CONFLICT_WINNER` + `type ConflictWinner`
- `ConflictContext`
- `ConflictResult`

Example:

```ts
import { CONFLICT_STRATEGY, CONFLICT_WINNER } from '@open-insights-web/foundation-data-model';

// Strategy selection happens in coordinator config
const strategy = CONFLICT_STRATEGY.SERVER_WINS;

// Winner values are constant-backed
const winner = CONFLICT_WINNER.SERVER;
```

## Cross-Tab Coordination

Cross-tab coordination uses constant-backed message types from `foundation-data-model`:

- `CROSS_TAB_MESSAGE_TYPE.LEADER_CANDIDATE`
- `CROSS_TAB_MESSAGE_TYPE.LEADER_HEARTBEAT`
- `CROSS_TAB_MESSAGE_TYPE.LEADER_ELECTED`
- `CROSS_TAB_MESSAGE_TYPE.LEADER_RESIGN`
- plus invalidation/sync status message types

Leader handling includes term-aware step-down behavior for higher-term remote leaders.

## Error Handling

Use `onError` in coordinator config for centralized error reporting.

Error flow principles:

- runtime component errors are normalized
- queue-level failures include mutation context where available
- dependency deadlocks are surfaced as explicit mutation failures

## Testing and Verification

Library-level verification commands:

```bash
npx tsc -p libs/foundation/sync-engine/tsconfig.lib.json --pretty false
npx vitest run libs/foundation/sync-engine/src/**/*.spec.ts
```

Consumer smoke compile checks used during refactors:

```bash
npx tsc -p libs/foundation/database/tsconfig.lib.json --pretty false
npx tsc -p libs/foundation/data-layer/tsconfig.lib.json --pretty false
npx tsc -p libs/foundation/bridge/tsconfig.lib.json --pretty false
```

## Extension Guidance

1. Keep shared contracts in `foundation-data-model` (avoid local duplicate shapes).
2. Prefer constant-backed fixed option contracts over string-literal unions.
3. Keep root exports narrow unless a symbol is intentionally public/stable.
4. Preserve restart-safe lifecycle semantics when adding timers/subscriptions.
5. Add regression tests for lifecycle and queue correctness when behavior changes.
