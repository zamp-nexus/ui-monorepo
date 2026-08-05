---
id: overview-nexus-product-experience
title: Nexus Product Experience
type: overview
status: active
owner: unassigned
source: repository
created: 2026-08-04
updated: 2026-08-05
reviewed: 2026-08-05
confidence: verified
priority: high
tags: [product, experience, design-system, nexus]
related: ["[[Overview MOC]]", "[[User Workflows]]", "[[Phase 3 - Governed Bring Your Own Data]]", "[[adr/0035-workflow-studio-v1-persists-but-does-not-execute-custom-workflows]]"]
repo_path: apps/nexus
---

# Nexus Product Experience

Nexus is a self-service analytical workspace for a person who needs to bring
data, ask a question, and understand the answer without being a specialist
analyst.

## Product loop

The primary path is **Upload → Context → Ask → Insight**.

- An uploaded file is private by default and receives a concise data profile.
- Contextual suggestions help the user begin, but a free-form question is
  always available. Chat accepts text questions; files are added through Data.
- The chat response adapts to the question rather than forcing a report shape.
- Source scope, evidence, caveats, and method appear when useful or requested.

## Information architecture

- **Analyze** is the primary workspace and route destination.
- **Workflows** exposes the system-owned analytical trust loop and a tenant's
  persisted custom Workflow drafts. Custom Workflows are simulated in this
  release; only the system Default Workflow executes.
- **Data** owns uploads, datasets, and data connections.
- **Sequences** are advanced workflows reached from the relevant data context;
  direct links remain valid for existing work.
- **Groups** organize chats. The selected Group is visibly highlighted;
  opening it or one of its chats makes it the destination for New chat.

## Experience standards

The interface is desktop-first and mobile-capable. It uses the root `DESIGN.md`
light analytical system: neutral surfaces, indigo interaction signal,
accessible focus and contrast, compact AI progress, and human visual approval
at 1440px, 1024px, 768px, and 390px.

The primary product outcome is time to first useful insight: a successful
upload, first question, and useful response. Completion, latency, and follow-up
engagement are supporting measures.

## Appearance and settings

Nexus uses one indigo product signal in both light and dark modes. Appearance
is a browser-local System, Light, or Dark preference and never changes data
scope or tenant policy. Settings presents Clerk-managed account context and
Nexus tenant context; only owners may change the analytical confidence threshold
and cost ceiling. Organization names remain Clerk-authoritative, while data
residency and model tier are informational.

Parent: [[Overview MOC]]
