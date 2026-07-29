---
id: reference-model-subprocessors
title: Model Provider Sub-Processors
type: reference
status: active
owner: unassigned
source: repository
created: 2026-07-29
updated: 2026-07-29
reviewed: 2026-07-29
confidence: verified
implementation: current
priority: high
tags: [operations, providers, privacy, compliance]
related: ["[[Operations MOC]]", "[[adr/0009-tiered-model-provider-routing]]"]
repo_path: libs/adapters/model-providers
code_refs:
  - libs/adapters/model-providers/src/zentra_adapter_model_providers/providers.py
  - libs/adapters/model-providers/src/zentra_adapter_model_providers/routing.py
---

# Model Provider Sub-Processors

Every provider an Investigation may reach, and what each does with what it
receives. The SQL Analyst sends governed query **result rows** to the model, so
this list is the set of parties that can see tenant data.

## Premium tier

None of these train on inference data. This is the guarantee premium tenants
buy, and `routing.py` refuses at import to place a training provider in a paid
chain.

| Provider | Role | Data handling |
| --- | --- | --- |
| Anthropic | Primary for every role | No training on API data by default |
| OpenAI | Second rung | No training on API data by default |
| Cerebras | Later rung | Does not retain inputs or outputs |
| Groq | Later rung | Contractually barred from training; no default retention; Zero Data Retention available |

## Free tier

The first two are the same no-training providers. **The last two train on the
traffic they receive.**

| Provider | Role | Data handling |
| --- | --- | --- |
| Cerebras | Evaluator primary, Analyst second | Does not retain inputs or outputs |
| Groq | Later rung | Contractually barred from training |
| **Gemini** | **Analyst primary** | **Free-tier content is used to improve Google's products** |
| **OpenRouter** | Later rung | **Free model access is exchanged for traffic becoming training signal** |
| Anthropic | Final backstop | No training on API data |

## What this requires

Today the only dataset is the synthetic commerce seed, so nothing a real person
would recognise reaches a training provider. That changes the moment a tenant
connects a real warehouse.

Before the first real connector ships to a free tenant:

- State plainly, at the point of connecting data, that free-tier analysis is
  processed by providers who may train on it.
- Publish this list where a prospective tenant can read it before connecting.
- Offer the premium tier as the private path, since that is what distinguishes
  it.

A tenant subject to GDPR is the controller for the data they connect. They can
only be assumed to have instructed this processing if they were told about it.

Parent: [[Operations MOC]]
