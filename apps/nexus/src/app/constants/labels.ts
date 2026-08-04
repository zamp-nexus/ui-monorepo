/**
 * The words the product uses for the API's own vocabulary.
 *
 * Every map here falls back to the raw literal at the call site, so an event
 * type or condition the API adds tomorrow renders as itself rather than
 * disappearing.
 */

export const eventLabels: Record<string, string> = {
  'analysis_run.evidence_erased': 'Evidence erased at the tenant’s request',
  'human_approval.denied': 'A decision was attempted and refused',
  'analysis_run.created': 'Question registered',
  'analysis_run.started': 'Governed query started',
  'analysis_run.evaluation_started': 'Validation opened',
  'analysis_run.validation_completed': 'Evidence validated',
  'human_approval.requested': 'Human judgment requested',
  'human_approval.granted': 'Human judgment recorded',
  'human_approval.rejected': 'Evidence rejected',
  'analysis_run.completed': 'Analysis Run completed',
  'analysis_run.rejected': 'Analysis Run rejected',
  'analysis_run.retry_requested': 'Recheck disagreed, retrying',
  'analysis_run.failed': 'Analysis Run failed',
  'agent.execution_completed': 'Agent step completed',
  'agent.execution_failed': 'Agent step failed',
};

/**
 * The status column for an `agent.execution_*` row, keyed by event type
 * rather than read off `entry.status`.
 *
 * Every ledger event carries the Analysis Run's own status at the moment
 * it was recorded (`pipeline.py`'s `_started_event`/`_audit_event` stamp
 * `AnalysisRunStatus.RUNNING` on both, deliberately -- the Analysis Run
 * itself really is still running when one of its steps fails; only a later,
 * separate transition ends it). That is correct for the Analysis-Run-level
 * rows, but reusing it for a step's own row shows "running" on a step that
 * has already failed.
 */
export const agentExecutionStatusLabels: Record<string, string> = {
  'agent.execution_started': 'running',
  'agent.execution_completed': 'completed',
  'agent.execution_failed': 'failed',
};

export const agentLabels: Record<string, string> = {
  orchestrator: 'Orchestrator',
  cube_analyst: 'Cube Analyst',
  // Read-compatibility (ADR-0025). Agent Executions that ran before the rename
  // still carry this role, and Replay renders them — a step labelled by its
  // raw role string would be the one place the old name leaks to a reader.
  sql_analyst: 'Cube Analyst',
  evaluator: 'Evaluator',
};

export const approvalHeadings: Record<string, string> = {
  low_confidence: 'Confidence below the tenant threshold',
  contradiction_unresolved: 'The recheck did not converge',
  tenant_policy: 'Review required by tenant policy',
  irreversible_action: 'Irreversible action requires approval',
  regulatory_exposure: 'Regulated data requires approval',
  evidence_incomplete: 'A claim cannot be followed to its evidence',
};

// The publication policy's own words. The heading leads with one reason; this
// is every condition that failed, because a reviewer deciding on the headline
// alone would be deciding on part of the picture.
export const conditionLabels: Record<string, string> = {
  converged: 'The independent recheck did not agree',
  confident: 'Bounded confidence is below the tenant threshold',
  evidenced: 'A substantive claim has no evidence that can be followed',
  uncontradicted: 'A contradiction is still open',
};

// Why an `analysis_run.failed` entry failed, in words a reader (not just an
// operator reading logs) can act on. A category with no entry here still
// renders — falling back to the failed step's own status label — rather than
// disappearing.
export const failureCategoryLabels: Record<string, string> = {
  no_enabled_agent: 'No agent is currently enabled to handle this step — check the Agent Registry.',
};
