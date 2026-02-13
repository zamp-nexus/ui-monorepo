# Foundation Query Engine

`@open-insights-web/foundation-query-engine` is the analytics and query orchestration layer for Open Insights.

## Purpose

This library provides a **pure orchestration layer** for query definition, building, compilation, and routing. It does **not** execute database or network work directly — execution always flows through `@open-insights-web/foundation-data-layer` hooks.

### What It Does

- **Query Modeling**: Defines the canonical `Query` contract with dimensions, measures, filters, joins, ordering, pagination, and time dimensions.
- **Query Building**: Fluent `QueryBuilder` API plus pre-configured presets for common analytics patterns.
- **Execution Routing**: `DecisionEngine` determines whether a query runs via Convex API (real-time) or DuckDB (analytics).
- **SQL Compilation**: `SqlCompiler` compiles `Query` objects into DuckDB-compatible SQL with LRU caching.
- **Schema Management**: `SchemaRegistry` and builder APIs for defining and validating analytics schemas.
- **React Integration**: `useDLQueryEngine` and `useDLMutateQueryEngine` hooks that delegate to foundation-data-layer.
- **Background Sync**: `useBackgroundFileSync` orchestrates stale-while-revalidate file synchronization for Parquet analytics tables.

### What It Does Not Do

- DuckDB lifecycle management or transport (handled by `foundation-bridge`)
- Convex query execution (handled by `foundation-data-layer`)
- Sync engine queueing internals (handled by `foundation-data-layer`)
- Database/OPFS management (handled by `foundation-database`)

## Installation

This package is consumed from the monorepo workspace:

```json
{
  "dependencies": {
    "@open-insights-web/foundation-query-engine": "*",
    "@open-insights-web/foundation-data-layer": "*"
  }
}
```

### Peer Dependencies

- `react` (`^18` or `^19`)
- `@tanstack/react-query`
- `@open-insights-web/foundation-data-layer`
- `@open-insights-web/foundation-data-model`
- `@open-insights-web/foundation-utils`

### Allowed Dependencies

| Package | Usage |
|---|---|
| `foundation-data-layer` | Hooks and utilities for execution delegation |
| `foundation-data-model` | Branded types, utility types, JSON types |
| `foundation-bridge` | Shared SQL utilities (escaping, quoting) |
| `foundation-utils` | Shared utilities (hashing, singletons, logging) |
| `foundation-database` | OPFS types only (for file download service) |

### Forbidden Direct Dependencies

- `foundation-sync-engine` — use data-layer abstractions instead

## Setup

`useDLQueryEngine` and `useDLMutateQueryEngine` require a `DataLayerProvider` in the component tree:

```tsx
import { DataLayerProvider } from '@open-insights-web/foundation-data-layer';

export const AppProviders = ({ children }: { children: React.ReactNode }) => (
  <DataLayerProvider config={{ tableConfigs: [] }}>
    {children}
  </DataLayerProvider>
);
```

## Usage Examples

### 1. Build a Typed Query

```ts
import {
  QueryBuilder,
  FRESHNESS_REQUIREMENTS,
} from '@open-insights-web/foundation-query-engine';

const query = new QueryBuilder()
  .dimension('orders.country')
  .sum('orders.amount', 'total_amount')
  .equals('orders.status', 'completed')
  .timeDimension('orders.created_at', 'month', 'last_30_days')
  .desc('orders.created_at')
  .limit(50)
  .withTotal(true)
  .freshness(FRESHNESS_REQUIREMENTS.NEAR_REALTIME)
  .build();
```

### 2. Execute via Unified Hook

```tsx
import {
  useDLQueryEngine,
  isAnalyticsResult,
  isTransactionalResult,
} from '@open-insights-web/foundation-query-engine';

export const OrdersByCountry = () => {
  const result = useDLQueryEngine({ query });

  if (result.isLoading) return <div>Loading...</div>;
  if (result.isError) return <div>{result.error?.message}</div>;

  if (isAnalyticsResult(result)) {
    return (
      <div>
        <p>Path: {result.executionPath} | SQL: {result.sql}</p>
        <pre>{JSON.stringify(result.data, null, 2)}</pre>
      </div>
    );
  }

  if (isTransactionalResult(result)) {
    return <pre>{JSON.stringify(result.data, null, 2)}</pre>;
  }

  return null;
};
```

### 3. Mutations via Unified Hook

```tsx
import { useDLMutateQueryEngine } from '@open-insights-web/foundation-query-engine';

const createQuery = {
  operation: 'create' as const,
  dimensions: [{ member: 'users.id' }],
};

export const CreateUserButton = () => {
  const { mutate, isPending } = useDLMutateQueryEngine<
    { id: string; name: string },
    { name: string }
  >({
    query: createQuery,
    onOptimistic: (vars) => ({
      id: `provisional-${Date.now()}`,
      name: vars.name,
    }),
  });

  return (
    <button disabled={isPending} onClick={() => mutate({ name: 'Ada' })}>
      Create
    </button>
  );
};
```

### 4. Use Query Presets

```ts
import {
  countByDimension,
  timeSeriesCount,
  topNQuery,
  kpiQuery,
  extendPreset,
} from '@open-insights-web/foundation-query-engine';

// Count by status
const statusCounts = countByDimension('orders.status');

// Daily order count for last 30 days
const dailyOrders = timeSeriesCount('orders.created_at', {
  granularity: 'day',
  dateRange: 'last_30_days',
});

// Top 10 customers by revenue
const topCustomers = topNQuery('orders.amount', 'users.name', 10);

// KPI with date range
const totalRevenue = kpiQuery('orders.amount', 'last_30_days', 'orders.created_at');

// Extend an existing preset
const filteredTopCustomers = extendPreset(topCustomers, (builder) => {
  builder.equals('orders.status', 'completed');
});
```

### 5. Schema Definition with Builders

```ts
import { schema, table, measure, dimension, timeDimension } from '@open-insights-web/foundation-query-engine';

const analyticsSchema = schema('analytics', '1.0.0')
  .table('orders', 'orders', (t) => {
    t.string('id', 'id', 'Order ID');
    t.string('status', 'status', 'Order Status');
    t.number('amount', 'amount', 'Order Amount');
    t.time('created_at', 'created_at', 'Created At');
    t.count('order_count', 'Total Orders');
    t.sum('total_revenue', 'amount', 'Total Revenue');
  })
  .build();
```

### 6. SQL Compilation

```ts
import { getSqlCompiler, QueryBuilder } from '@open-insights-web/foundation-query-engine';

const query = new QueryBuilder()
  .dimension('users.country')
  .sum('orders.amount', 'total')
  .innerJoin('orders.user_id', 'users.id')
  .equals('users.status', 'active')
  .build();

const compiler = getSqlCompiler();
const result = compiler.compile(query);
// result.sql:
// SELECT "users"."country" AS "country", SUM("orders"."amount") AS "total"
// FROM "orders"
// INNER JOIN "users" ON "orders"."user_id" = "users"."id"
// WHERE "users"."status" = 'active'
// GROUP BY "users"."country"
```

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    Query Engine                          │
│                                                         │
│  ┌──────────────┐   ┌────────────────┐                  │
│  │ QueryBuilder  │──>│ Query (object) │                  │
│  │ + Presets     │   └───────┬────────┘                  │
│  └──────────────┘           │                           │
│                     ┌───────▼────────┐                  │
│                     │ TableExtractor │                   │
│                     └───────┬────────┘                  │
│                     ┌───────▼────────┐                  │
│                     │ DecisionEngine │                   │
│                     └──┬──────────┬──┘                  │
│              ┌─────────▼──┐  ┌───▼──────────┐           │
│              │ SqlCompiler │  │ FilterConvert│           │
│              └─────────┬──┘  └───┬──────────┘           │
│              ┌─────────▼──┐  ┌───▼──────────┐           │
│              │useDLAnalyt.│  │ useDLGetList  │  ← hooks  │
│              └────────────┘  └──────────────┘           │
└─────────────────────────────────────────────────────────┘
                          │
                          ▼
              foundation-data-layer (execution)
```

### Module Overview

| Module | Purpose |
|---|---|
| `src/types/` | Canonical contracts, constants, type guards, and utility functions |
| `src/builder/` | Fluent `QueryBuilder` API and preset factory functions |
| `src/engine/` | `TableExtractor`, `DecisionEngine`, and `FilterConverter` |
| `src/compiler/` | `SqlCompiler` (DuckDB SQL generation) and SQL utility wrappers |
| `src/schema/` | `SchemaRegistry`, builder APIs, and schema/query validators |
| `src/hooks/` | React integration: `useDLQueryEngine`, `useDLMutateQueryEngine`, `useBackgroundFileSync` |
| `src/utils/` | Member reference parsing utilities |

### Decision Engine Rules

The `DecisionEngine` routes queries using these rules (in priority order):

1. **Mutations** → API (create/update/delete always via Convex)
2. **Has joins** → DuckDB (SQL required for joins)
3. **Has measures** → DuckDB (SQL required for aggregations)
4. **Multiple tables** → DuckDB (implies joins needed)
5. **Local-only table** → DuckDB (no API available)
6. **No list API defined** → DuckDB (use Parquet files)
7. **Default** → API (simple query, real-time data via WebSocket)

### Hook Result Discriminated Unions

`useDLQueryEngine` returns one of three discriminated result types:

- `AnalyticsResult` — `executionPath === 'analytics'`, includes `sql`, `executionTimeMs`, download progress
- `TransactionalResult` — `executionPath === 'transactional'`, Convex real-time data
- `PendingResult` — `executionPath === null`, before routing decision

Use `isAnalyticsResult()`, `isTransactionalResult()`, and `isPendingResult()` type guards.

### Singleton Services

The library uses singleton factories (from `foundation-utils`) for shared services:

- `getSqlCompiler()` — shared SQL compiler with LRU cache (100 entries default)
- `getDecisionEngine()` — shared decision engine instance
- `getTableExtractor()` — shared stateless table extractor

All singletons can be reset for testing via `resetSqlCompiler()`, `resetDecisionEngine()`, `resetTableExtractor()`.

## Configuration

Configuration is managed via `QueryEngineConfig` in `src/types/config.ts`:

```ts
interface QueryEngineConfig {
  dataSourceApi?: FunctionReference<'query'>;  // Convex query for Parquet metadata
  defaultStaleTime?: number;                    // Default: 6 hours (21600000 ms)
  autoRefreshOnUpdate?: boolean;                // Default: false
  backgroundPollInterval?: number;              // 0 = disabled (default)
  debug?: boolean;                              // Enable debug logging
}
```

Use `resolveQueryEngineConfig(config)` to apply defaults.

## Type System

### Branded Types

Branded types provide type safety for domain identifiers. Import them from `foundation-data-model`:

```ts
import type { MemberRef, QueryId, SqlTableName } from '@open-insights-web/foundation-data-model';
import { MemberRef as MemberRefUtil, QueryId as QueryIdUtil } from '@open-insights-web/foundation-data-model';

// Type usage
const processQuery = (id: QueryId): void => { /* ... */ };

// Value creation
const id = QueryIdUtil.create();
const ref = MemberRefUtil.from('orders.amount');
```

### Const Object Pattern

All enumerations use the const object pattern (no string literal unions):

```ts
// ✅ Correct pattern (used throughout)
const AGGREGATIONS = { SUM: 'sum', COUNT: 'count', /* ... */ } as const;
type Aggregation = (typeof AGGREGATIONS)[keyof typeof AGGREGATIONS];

// ❌ Avoided
type Aggregation = 'sum' | 'count';
```

## Development

### Validation Commands

```bash
# Type check
npx tsc -p libs/foundation/query-engine/tsconfig.lib.json --noEmit --pretty false

# Lint
npx eslint "libs/foundation/query-engine/src/**/*.{ts,tsx}"

# Test
npx vitest run --config libs/foundation/query-engine/vite.config.mts

# Circular dependency check
npx madge --circular --extensions ts,tsx libs/foundation/query-engine/src/
```

### Extension Guidelines

When extending this library:

1. Add shared value/type constants in `src/types/` and derive types from const objects.
2. Keep internal imports direct (e.g., `../types/filter`) — do not route through barrel files internally.
3. Reuse existing shared helpers from `foundation-utils` and `foundation-bridge` before adding new utility code.
4. Keep caches bounded; avoid unbounded maps for long-lived singletons.
5. Implement `IDisposable` for any class that holds resources.
6. Add targeted tests with each behavior change.
7. Use `UPPER_SNAKE_CASE` for constants, `PascalCase` for types/interfaces/classes.
8. Never give a constant and a type the same name.

### Contributing Checklist

Before opening a change:

1. Keep changes scoped to `libs/foundation/query-engine/` unless explicitly requested.
2. Preserve strict TypeScript compatibility (no `any`, no unchecked casts).
3. Add or update tests for new behavior.
4. Confirm no dead code and no broken imports.
5. Keep docs and examples aligned with the exported API.
6. Run type check and lint before submitting.

## License

Internal use only. Part of the Open Insights Web monorepo.
