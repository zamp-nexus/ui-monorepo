# Domain Docs

How the engineering skills should consume this repo's domain documentation when exploring the codebase.

This is an Nx monorepo (`apps/*`, `libs/*`, `tools/*`), so it uses the **multi-context** layout.

## Before exploring, read these

- **`CONTEXT-MAP.md`** at the repo root — it points at one `CONTEXT.md` per context. Read each one relevant to the topic.
- **`docs/adr/`** — system-wide decisions. Read ADRs that touch the area you're about to work in.
- **`apps/<app>/docs/adr/`** or **`libs/<area>/docs/adr/`** — context-scoped decisions for the area you're about to work in.

If any of these files don't exist, **proceed silently**. Don't flag their absence; don't suggest creating them upfront. The `/domain-modeling` skill (reached via `/grill-with-docs` and `/improve-codebase-architecture`) creates them lazily when terms or decisions actually get resolved.

## File structure

```
/
├── CONTEXT-MAP.md
├── docs/adr/                          ← system-wide decisions
├── apps/
│   └── insights-os/
│       ├── CONTEXT.md
│       └── docs/adr/                  ← app-specific decisions
├── libs/
│   ├── foundation/
│   │   ├── CONTEXT.md
│   │   └── docs/adr/
│   ├── shared/
│   │   ├── CONTEXT.md
│   │   └── docs/adr/
│   ├── shop/                          ← reserved in workspaces, not yet populated
│   └── api/products/                  ← reserved in workspaces, not yet populated
└── tools/
    ├── CONTEXT.md
    └── docs/adr/
```

Each context corresponds to a top-level workspace area declared in `package.json`'s `workspaces` field (`apps/*`, `libs/foundation/*`, `libs/shared/*`, `libs/shop/*`, `libs/api/products`, `tools/*`), not to every individual package inside it — e.g. `libs/foundation` is one context even though it contains 15+ packages (auth, authz, database, http, sync-engine, etc.), unless one of those packages grows a distinct enough domain vocabulary to warrant splitting out its own `CONTEXT.md`.

## Use the glossary's vocabulary

When your output names a domain concept (in an issue title, a refactor proposal, a hypothesis, a test name), use the term as defined in the relevant `CONTEXT.md`. Don't drift to synonyms the glossary explicitly avoids.

If the concept you need isn't in the glossary yet, that's a signal — either you're inventing language the project doesn't use (reconsider) or there's a real gap (note it for `/domain-modeling`).

## Flag ADR conflicts

If your output contradicts an existing ADR, surface it explicitly rather than silently overriding:

> _Contradicts ADR-0007 (event-sourced orders) — but worth reopening because…_
