---
id: component-cube-adapter
title: Cube Adapter
type: component
status: active
owner: unassigned
source: repository
created: 2026-07-29
updated: 2026-07-29
reviewed: 2026-07-29
confidence: verified
implementation: current
priority: high
tags: [component, cube, adapter]
aliases: [cube]
related: ["[[Components MOC]]", "[[Cube Semantic Model]]", "[[Semantic Modeling]]"]
repo_path: libs/adapters/cube
code_refs:
  - libs/adapters/cube/src/zentra_adapter_cube/client.py
  - libs/adapters/cube/src/zentra_adapter_cube/scenario.py
---

# Cube Adapter

The Cube client loads governed semantic queries and exposes readiness. The
`EuRefundSpikeScenario` implements the application scenario port with two
queries: monthly EU order/refund measures and July refund-reason breakdown.

The scenario rejects results that do not match the deterministic seed. A
successful result returns structured metric comparisons, checks/issues, and an
`artifact://` evidence reference—never raw Cube rows.

Only this explicit scenario exists. There is no general-purpose SQL, dataset, or
natural-language query endpoint.

Data detail: [[Cube Semantic Model]].

Parent: [[Components MOC]]
