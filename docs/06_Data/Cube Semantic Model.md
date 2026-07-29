---
id: data-cube-semantic-model
title: Cube Semantic Model
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
tags: [data, cube, semantic-model]
related: ["[[Data MOC]]", "[[Synthetic Warehouse]]", "[[Cube Adapter]]"]
repo_path: infra/cube/model/cubes/Commerce.js
code_refs:
  - infra/cube/model/cubes/Commerce.js
  - infra/cube/tests/eu-refund-spike.json
  - libs/adapters/cube/src/zentra_adapter_cube/semantic.py
---

# Cube Semantic Model

The `Commerce` cube joins the synthetic warehouse into one governed analytical
surface. It exposes:

- gross revenue;
- net revenue;
- order count;
- average order value;
- refund amount;
- refund rate;
- active customers;
- repeat-purchase rate.

Dimensions include time, region, and refund reason needed by the deterministic
scenario. The model, not the Investigation, owns metric definitions and grain.

The scenario queries June–July 2026 EU monthly measures and July refund reasons,
then checks exact seed values. Raw Cube rows are not persisted to Postgres,
ClickHouse, or the browser response.

Parent: [[Data MOC]]
