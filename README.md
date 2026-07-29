# ZentraOS

ZentraOS is a trust-first analytics system: investigations are tenant-isolated,
results carry typed outcome evidence, governed work can stop at a human gate,
and the process can be replayed without retaining raw customer data.

Phase 1A adds the first deterministic investigation trust loop for the governed
`eu_refund_spike` scenario. It queries Cube, validates the result, pauses for
owner or admin approval, persists state in Postgres, and delivers an append-only
timeline to ClickHouse. The agent registry remains empty and no model-backed
agent, LangGraph workflow, or fabricated confidence score is included.

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
npm exec -- nx serve zentra-os
```

The frontend runs at `http://localhost:4200`, the API at
`http://localhost:8000`, Cube at `http://localhost:4000`, and ClickHouse HTTP at
`http://localhost:8123`.

Copy the frontend and API `.env.example` files into untracked `.env` files and
provide Clerk, Langfuse OTLP, and E2B credentials when exercising those
integrations.

The authenticated Phase 1A API exposes:

- `POST /v1/investigations`
- `GET /v1/investigations/{investigation_id}`
- `POST /v1/investigations/{investigation_id}/approvals/{approval_id}/decision`

Only `{"scenario_key":"eu_refund_spike"}` is accepted. The canonical question
and governed result are determined by the server.

## Verification

```bash
uv run python tools/architecture/verify_known_bad_boundary.py
npm exec -- nx run-many -t lint test build typecheck
npm exec -- nx e2e zentra-os-e2e
```

Managed Neon and ClickHouse Cloud resources live under `infra/terraform`.
Terraform applies are explicit operator actions; provider tokens, state, plans,
and generated connection credentials must remain outside the repository.

## Engineering knowledge

Open [`docs/`](docs/README.md) as the plugin-independent Obsidian vault and
start at the [ZentraOS Knowledge Base](docs/00_Index/ZentraOS%20Knowledge%20Base.md).
Validate its metadata, links, and source references with:

```bash
npm exec -- nx run docs:check
```
