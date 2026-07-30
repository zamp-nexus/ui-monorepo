# Investigation

Investigation owns one traceable attempt to answer a governed business question and the states that make its progress explicit.

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

**Evidence Citation**:
A Tenant-authorized reference connecting one substantive Draft Finding claim to its governed metric, query context, producing Agent Execution, validated aggregate result, and Evaluator outcome.
_Avoid_: Evidence Reference, opaque artifact pointer, raw source row

**Root Cause Claim**:
A Finding claim asserting that evidence establishes why an observed change occurred, admissible only under an accepted causal-evidence standard.
_Avoid_: Driver, association, reason code

**Tombstone**:
A non-sensitive record that cited evidence and its derived content were erased, retaining only the deletion category and timestamp needed to explain their absence.
_Avoid_: Deleted evidence, placeholder, missing artifact

**Evaluation Attempt**:
One bounded validation pass that either permits completion, requests retry, or opens a Human Approval gate.
_Avoid_: Evaluator run, confidence check

**Validation Result**:
Deterministic evidence stating which declared checks passed and which issues remain; it never invents confidence.
_Avoid_: Fake confidence, quality score
