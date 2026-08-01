# Agent Execution

Agent Execution owns autonomous analytical workers and the constrained work they perform during an Investigation.

## Language

**Agent**:
A registered autonomous worker that performs one cognitive role through the Agent Port. Auditor and Human Reviewer are explicitly not Agents.
_Avoid_: Bot, participant, human reviewer

**Agent Execution**:
One bounded invocation of an Agent for one Investigation and Tenant.
_Avoid_: Agent run, task process

**Insight Agent**:
A registered Agent that turns validated upstream evidence into a Draft Finding without claiming causality the evidence cannot establish. Its canonical role value is `insight`; `insight_root_cause` is a read-only compatibility value that Phase 1 wrote and nothing writes again.
_Avoid_: Root-Cause Agent, Finding writer, synthesis step

**Outcome Signal**:
Role-appropriate evidence about an Agent Execution: either calibrated confidence or an explicit validation result.
_Avoid_: Universal confidence score, quality score

**Auditor**:
The deterministic subscriber that records redacted investigation events as Audit Entries.
_Avoid_: Auditor agent

**Human Reviewer**:
A User acting at a Human Approval gate.
_Avoid_: Human-review agent
