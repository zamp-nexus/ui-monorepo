# Investigation

Investigation owns one traceable attempt to answer a governed business question and the states that make its progress explicit.

Groups and Projects organize the Investigation Thread surface. They are
Tenant-owned navigation containers, not analytical authority and not nested
ACL boundaries. Archived containers remain readable and make descendants
read-only without deleting Investigation history.

An Investigation Thread is the linear conversational boundary around immutable
messages and separately governed Investigations. A question is free text and a
Thread activates on its first message (ADR-0023); whether the evidence can
answer it is the Cube Analyst's judgement against the tenant's live catalog,
not a router's against a fixed list. Draft Threads — which held unresolved
router clarifications — remain readable but are no longer created.

Follow-ups and retries create new immutable Investigations with linear parent,
retry-of, and Thread-sequence lineage. Published Findings may create a strict
Visualization Brief and independently retriable presentation artifact.

## Language

**Investigation Status**:
The current lifecycle position of an Investigation, including whether it is active, blocked for Human Approval, or terminal.
_Avoid_: Run state, workflow status

**Finding**:
A published, evidence-backed analytical conclusion produced by an Investigation after deterministic publication policy or any required Human Approval.
_Avoid_: Answer, response, insight blob

**Draft Finding**:
An unpublished analytical conclusion proposed by the Insight Agent after evaluation and before publication policy or Human Approval decides its outcome.
_Avoid_: Finding, answer draft, Orchestrator synthesis

**Measurement**:
The governed metric, value, and period an observed claim rests on, copied from the validated aggregate rather than restated by the Agent.
_Avoid_: Figure, number, data point

**Evidence Citation**:
A Tenant-authorized reference connecting one substantive Draft Finding claim to its governed metric, query context, producing Agent Execution, validated aggregate result, and Evaluator outcome.
_Avoid_: Evidence Reference, opaque artifact pointer, raw source row

**Root Cause Claim**:
A Finding claim asserting that evidence establishes why an observed change occurred, admissible only under an accepted causal-evidence standard.
_Avoid_: Driver, association, reason code

**Tombstone**:
A non-sensitive record that cited evidence and its derived content were erased, retaining only the deletion category and timestamp needed to explain their absence.
_Avoid_: Deleted evidence, placeholder, missing artifact

**Erasure Operation**:
One durable, retryable request to erase a terminal Investigation's evidence, which reports success only when every governed surface is clear.
_Avoid_: Delete job, purge, hard delete

**Evaluation Attempt**:
One bounded validation pass that either permits completion, requests retry, or opens a Human Approval gate.
_Avoid_: Evaluator run, confidence check

**Validation Result**:
Deterministic evidence stating which declared checks passed and which issues remain; it never invents confidence.
_Avoid_: Fake confidence, quality score

**Visualization Artifact**:
One independently metered terminal presentation of a Visualization Brief,
including renderer status, retry lineage, and erasure state.
_Avoid_: Finding, analytical result, dashboard
