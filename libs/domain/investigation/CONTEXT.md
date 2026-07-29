# Investigation

Investigation owns one traceable attempt to answer a governed business question and the states that make its progress explicit.

## Language

**Investigation Status**:
The current lifecycle position of an Investigation, including whether it is active, blocked for Human Approval, or terminal.
_Avoid_: Run state, workflow status

**Finding**:
An evidence-backed analytical conclusion produced by an Investigation after validation and any required Human Approval.
_Avoid_: Answer, response, insight blob

**Evaluation Attempt**:
One bounded validation pass that either permits completion, requests retry, or opens a Human Approval gate.
_Avoid_: Evaluator run, confidence check

**Validation Result**:
Deterministic evidence stating which declared checks passed and which issues remain; it never invents confidence.
_Avoid_: Fake confidence, quality score
