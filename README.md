# ZentraOS

ZentraOS is a trust-first analytics system: investigations are tenant-isolated,
agent outputs carry typed outcome evidence, low-confidence work stops at a human
gate, and the process can be replayed without retaining raw customer data.

Phase 0 contains the foundation only. The agent registry is empty and no agent
implementation is included.

## Prerequisites

- Node.js 24 and npm
- Python 3.13
- `uv`
- Docker with Compose
- Terraform 1.9+ for managed infrastructure

## Local foundation

```bash
npm ci
uv sync --frozen
docker compose up -d --wait control-postgres warehouse-postgres clickhouse cube
DATABASE_OWNER_URL=postgresql+psycopg://zentra_owner:zentra_owner@localhost:5432/zentra_control \
  npm exec -- nx run postgres:migrate
npm exec -- nx serve api
```

In another terminal:

```bash
npm exec -- nx serve insights-os
```

The frontend runs at `http://localhost:4200`, the API at
`http://localhost:8000`, Cube at `http://localhost:4000`, and ClickHouse HTTP at
`http://localhost:8123`.

Copy the frontend and API `.env.example` files into untracked `.env` files and
provide Clerk, Langfuse OTLP, and E2B credentials when exercising those
integrations.

## Verification

```bash
uv run python tools/architecture/verify_known_bad_boundary.py
npm exec -- nx run-many -t lint test build typecheck
```

Managed Neon and ClickHouse Cloud resources live under `infra/terraform`.
Terraform applies are explicit operator actions; provider tokens, state, plans,
and generated connection credentials must remain outside the repository.
