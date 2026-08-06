# Chat & Analysis Run

This context's package path (`libs/domain/analysis_run`) has been renamed to
match; see [[adr/0028-chat-session-and-analysis-run-replace-investigation-thread-and-investigation]]
for the terminology it now owns: Chat Session, Message, and Analysis Run
(replacing Investigation Thread, Thread Message, and Investigation). This file
documents the Analysis Run's internal working state — the part that stays
hidden behind the Activity Feed unless a User opens it.

Groups organize the Chat Session surface directly — no Project layer sits
between them. Groups are Organization-owned navigation containers, not
analytical authority and not nested ACL boundaries. Archived Groups and
archived Chat Sessions remain readable and make descendants read-only without
deleting Analysis Run history.

A Chat Session is the linear conversational boundary around immutable
Messages and the Analysis Runs those Messages may open. Intake decides, per
Message, one of three outcomes: the question resolves inside the
Organization's Analytical Scope and opens an Analysis Run (see
[[adr/0027-analytical-scope-replaces-scenario-whitelist]]); it's ambiguous or
out of scope and Intake clarifies instead of fabricating work; or it isn't
analytical at all, in which case Intake hands off to the Conversational Agent
for a plain reply with no Analysis Run, no cost tracking, and no evidence.

Once opened, an Analysis Run accumulates its working memory on an Analysis
Workspace rather than passing through a fixed sequence of steps — see
[[adr/0026-investigation-engine-owns-orchestration]]. Whether the evidence can
actually answer is the Cube Analyst's judgement against the Organization's
live catalog, not a router's against a fixed list.

Follow-ups and retries create new immutable Analysis Runs with linear parent,
retry-of, and Chat-sequence lineage — a related follow-up chains to the run it
follows rather than merging into it, so cost, evidence, and approval stay
independently traceable per question even within one long-running Chat
Session. Published Findings may create a strict Visualization Brief and
independently retriable presentation artifact.

## Language

**Analysis Run Status**:
The current lifecycle position of an Analysis Run, including whether it is active, blocked for Human Approval, or terminal.
_Avoid_: Investigation Status, run state, workflow status

**Analysis Workspace**:
The durable object one Analysis Run accumulates its working memory onto — Facts, Hypotheses, Knowledge Gaps, Conflicts, evidence references, and bounded Confidence — read and written by Work Items rather than passed through a fixed sequence of steps.
_Avoid_: Investigation Board, workspace, state, scratchpad

**Work Item**:
One unit of work an Orchestrator Loop assigns to a capability-matched Agent against a gap on the Analysis Workspace, tracked through pending, running, waiting, blocked, completed, or rejected.
_Avoid_: Task, step, node

**Knowledge Gap**:
Something the Analysis Workspace does not yet know, carrying a priority an Orchestrator Loop uses to decide what to work on next.
_Avoid_: Question, todo, missing data

**Conflict**:
A contradiction between two pieces of evidence on the Analysis Workspace that must be resolved or explicitly documented before Insight may proceed.
_Avoid_: Discrepancy, error, mismatch

**Analytical Scope**:
The Organization-configured allowlist of Cube cubes, and optionally members, that Intake and analytical Agents may resolve a question against; narrower than but never wider than `SemanticCatalog.reject_ungoverned`.
_Avoid_: Scenario, whitelist, permission

**Completion Criteria**:
The deterministic set of conditions — question answered, no high-priority Knowledge Gaps, evidence validated, Conflicts resolved or documented, confidence bounded above threshold, budget not exhausted — an Orchestrator Loop checks before stopping; never "no Work Items remain" alone.
_Avoid_: Done, finished, queue empty

**Finding**:
A published, evidence-backed analytical conclusion produced by an Analysis Run after deterministic publication policy or any required Human Approval.
_Avoid_: Answer, response, insight blob

**Draft Finding**:
An unpublished analytical conclusion proposed by the Insight Agent after evaluation and before publication policy or Human Approval decides its outcome.
_Avoid_: Finding, answer draft, Orchestrator synthesis

**Measurement**:
The governed metric, value, and period an observed claim rests on, copied from the validated aggregate rather than restated by the Agent.
_Avoid_: Figure, number, data point

**Evidence Citation**:
An Organization-authorized reference connecting one substantive Draft Finding claim to its governed metric, query context, producing Agent Execution, validated aggregate result, and Evaluator outcome.
_Avoid_: Evidence Reference, opaque artifact pointer, raw source row

**Root Cause Claim**:
A Finding claim asserting that evidence establishes why an observed change occurred, admissible only under an accepted causal-evidence standard.
_Avoid_: Driver, association, reason code

**Tombstone**:
A non-sensitive record that cited evidence and its derived content were erased, retaining only the deletion category and timestamp needed to explain their absence.
_Avoid_: Deleted evidence, placeholder, missing artifact

**Erasure Operation**:
One durable, retryable request to erase a terminal Analysis Run's evidence, which reports success only when every governed surface is clear.
_Avoid_: Delete job, purge, hard delete

**Evaluation Attempt**:
One bounded validation pass that either permits completion, requests retry, or opens a Human Approval gate.
_Avoid_: Evaluator run, confidence check

**Validation Result**:
Deterministic evidence stating which declared checks passed and which issues remain; it never invents confidence.
_Avoid_: Fake confidence, quality score

**Catalog-only sample sentinel**:
Both the Analyst and Evaluator report `sample_size = 0` when an answer is about
the semantic catalog rather than sampled data. This is not zero observations:
the statistical confidence ceiling and observed-claim evidence gate do not
apply, while convergence, model independence, and contradiction checks remain.
Missing sample sizes are unknown, not catalog-only, and stay conservatively
bounded.

**Visualization Artifact**:
One independently metered terminal presentation of a Visualization Brief,
including renderer status, retry lineage, and erasure state.
_Avoid_: Finding, analytical result, dashboard
