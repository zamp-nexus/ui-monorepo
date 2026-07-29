---
id: data-synthetic-warehouse
title: Synthetic Warehouse
type: data-model
status: active
owner: unassigned
source: repository
created: 2026-07-29
updated: 2026-07-29
reviewed: 2026-07-29
confidence: verified
implementation: current
priority: high
tags: [data, warehouse, synthetic]
related: ["[[Data MOC]]", "[[Cube Semantic Model]]", "[[Semantic Modeling]]"]
repo_path: infra/warehouse/init/001_ecommerce_seed.sql
code_refs:
  - infra/warehouse/init/001_ecommerce_seed.sql
  - infra/cube/tests/eu-refund-spike.json
---

# Synthetic Warehouse

The separate warehouse Postgres database contains deterministic e-commerce
fixtures for customers, products, orders, order items, payments, refunds,
shipments, geography, and refund reasons.

It is development/test infrastructure, not the ZentraOS transactional control
plane and not a production customer-data store.

The seed guarantees the Phase 1A EU scenario:

| Month | EU orders | Refund amount | Refund rate |
| --- | ---: | ---: | ---: |
| June 2026 | 4 | $20 | 25% |
| July 2026 | 4 | $260 | 75% |

July's increase is associated with shipping-delay refunds. The small four-order
sample intentionally triggers tenant-policy Human Approval.

Parent: [[Data MOC]]
