import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';

import { Button } from '@open-zentra/foundation-design-system';

import { apiUrl, requestJson, type TokenSource } from './api';
import {
  DraftFindingPanel,
  LegacyFindingNotice,
  type DraftFinding,
} from './draft-finding-panel';
import { useAuth, useAuthSession } from '@open-zentra/foundation-auth';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AnimatePresence,
  motion,
  useReducedMotion,
} from 'motion/react';
import {
  Link,
  Navigate,
  Route,
  Routes,
  useNavigate,
  useParams,
} from 'react-router-dom';

import styles from './app.module.scss';

interface AppProps {
  readonly clerkConfigured?: boolean;
}

interface DependencyStatus {
  readonly status: 'ready' | 'unavailable';
}

interface ReadinessResponse {
  readonly status: 'ready' | 'degraded';
  readonly dependencies: Readonly<Record<string, DependencyStatus>>;
}

interface IdentityContext {
  readonly user_id: string;
  readonly tenant_id: string;
  readonly email: string;
  readonly tenant_name: string;
  readonly role: 'owner' | 'admin' | 'member' | 'viewer';
}

interface MetricComparison {
  readonly metric: string;
  readonly previous_value: string;
  readonly previous_label: string | null;
  readonly current_value: string;
  readonly current_label: string | null;
  readonly unit: string;
}

interface Investigation {
  readonly investigation_id: string;
  readonly canonical_question: string;
  readonly scenario_key: string;
  readonly status:
    | 'pending'
    | 'running'
    | 'evaluating'
    | 'awaiting_approval'
    | 'completed'
    | 'rejected'
    | 'failed'
    | 'cancelled';
  readonly version: number;
  readonly evaluation_attempts: number;
  readonly created_at: string;
  readonly updated_at: string;
  readonly finished_at: string | null;
  readonly finding: {
    readonly headline: string;
    readonly summary: string;
    readonly metrics: readonly MetricComparison[];
    readonly evidence_references: readonly string[];
  } | null;
  // Present only for Investigations that ran through the Insight Agent.
  // Null means legacy narrative, not missing evidence.
  readonly draft_finding: DraftFinding | null;
  readonly outcome:
    | {
        readonly kind: 'validation';
        readonly passed: boolean;
        readonly checks: readonly string[];
        readonly issues: readonly string[];
      }
    | {
        readonly kind: 'confidence';
        readonly score: number;
        readonly calibration_method: string;
      }
    | null;
  readonly pending_approval: {
    readonly approval_id: string;
    readonly reason: string;
    readonly requested_at: string;
    readonly can_decide: boolean;
    // Every condition the deterministic policy found failing, in its own
    // vocabulary — the same words the API and Replay use.
    readonly failed_conditions: readonly string[];
  } | null;
  readonly timeline: readonly {
    readonly entry_id: string;
    readonly event_type: string;
    readonly status: string;
    readonly created_at: string;
    readonly artifact_references: readonly string[];
    readonly delivery: 'complete' | 'pending';
    readonly agent_id: string | null;
    readonly step: number | null;
    readonly model: string | null;
  }[];
  readonly audit_delivery: 'complete' | 'pending';
}

type RejectionReason =
  | 'insufficient_evidence'
  | 'incorrect_interpretation'
  | 'policy_mismatch'
  | 'needs_more_analysis';

interface Scenario {
  readonly key: string;
  readonly question: string;
  readonly facts: readonly string[];
}

// A Clerk session token lives 60 seconds. Holding one in component state and
// reusing it means the first click on a page left open sends a dead token — the
// API answers "Invalid bearer token" and it reads like a configuration fault.
// Minting per request costs nothing: Clerk caches internally and refreshes near
// expiry, so this is a memory read almost every time.
const requestReadiness = async (): Promise<ReadinessResponse> => {
  const response = await fetch(`${apiUrl}/health/ready`);
  return (await response.json()) as ReadinessResponse;
};

const ProductMark = () => (
  <Link className={styles.brand} to="/" aria-label="ZentraOS home">
    <span className={styles.mark} aria-hidden="true">
      Z
    </span>
    <span>ZentraOS</span>
  </Link>
);

const SetupRequired = () => (
  <main className={styles.entryPage}>
    <ProductMark />
    <section className={styles.entryHero}>
      <p className={styles.eyebrow}>Identity setup required</p>
      <h1>Connect Clerk to enter the observatory.</h1>
      <p>
        Add <code>VITE_CLERK_PUBLISHABLE_KEY</code>. ZentraOS never assumes a
        development tenant.
      </p>
    </section>
  </main>
);

const SignedOut = ({ login }: { readonly login: () => Promise<void> }) => (
  <main className={styles.entryPage}>
    <ProductMark />
    <section className={styles.entryHero}>
      <p className={styles.eyebrow}>Forensic analytics, governed by evidence</p>
      <h1>Trust is the product.</h1>
      <p>
        Follow every analytical claim from governed metric to human judgment.
      </p>
      <Button
        className={styles.primaryAction}
        size="lg"
        onClick={() => void login()}
      >
        Enter the observatory
      </Button>
    </section>
  </main>
);

const SystemStrip = ({
  identity,
  readiness,
}: {
  readonly identity: IdentityContext;
  readonly readiness: ReadinessResponse | undefined;
}) => (
  <div className={styles.systemStrip}>
    <span>
      <i
        className={
          readiness?.status === 'ready' ? styles.readyDot : styles.reviewDot
        }
      />
      {readiness?.status === 'ready' ? 'Foundation ready' : 'Dependency review'}
    </span>
    <span>{identity.tenant_name}</span>
    <span>
      {identity.role} · {identity.tenant_id.slice(0, 8)}
    </span>
    <span>Phase 1A · deterministic</span>
  </div>
);

const ObservatoryShell = ({
  children,
  identity,
  readiness,
}: {
  readonly children: React.ReactNode;
  readonly identity: IdentityContext;
  readonly readiness: ReadinessResponse | undefined;
}) => {
  const { logout, user } = useAuth();
  return (
    <main className={styles.observatory}>
      <aside className={styles.rail}>
        <ProductMark />
        <nav aria-label="Primary navigation">
          <Link className={styles.railLink} to="/" aria-label="New investigation">
            <span aria-hidden="true">＋</span>
            <small>New</small>
          </Link>
        </nav>
        <button
          className={styles.userButton}
          type="button"
          title={user?.email ?? 'Account'}
          onClick={() => void logout()}
        >
          {user?.email?.slice(0, 1).toUpperCase() ?? 'A'}
          <span className={styles.srOnly}>Sign out</span>
        </button>
      </aside>
      <div className={styles.shellBody}>
        <SystemStrip identity={identity} readiness={readiness} />
        {children}
      </div>
    </main>
  );
};

const Launcher = ({
  getToken,
  identity,
}: {
  readonly getToken: TokenSource;
  readonly identity: IdentityContext;
}) => {
  const navigate = useNavigate();
  // The catalogue comes from the API rather than living here. The question text
  // used to be written out in this file and again in the service; a second
  // scenario would have made that three copies to keep in step.
  const scenarios = useQuery({
    queryKey: ['scenarios'],
    queryFn: () => requestJson<Scenario[]>('/v1/scenarios', getToken),
    enabled: true,
  });
  const mutation = useMutation({
    mutationFn: (scenarioKey: string) =>
      requestJson<Investigation>('/v1/investigations', getToken, {
        method: 'POST',
        body: JSON.stringify({ scenario_key: scenarioKey }),
      }),
    onSuccess: (investigation) =>
      navigate(`/investigations/${investigation.investigation_id}`, {
        state: { investigation },
      }),
  });

  const isViewer = identity.role === 'viewer';

  return (
    <section className={styles.launcher}>
      <div className={styles.launchIndex} aria-hidden="true">
        Evidence inquiries
      </div>
      <div className={styles.launchContent}>
        <p className={styles.eyebrow}>Governed synthetic scenarios</p>
        <ul className={styles.scenarioList}>
          {(scenarios.data ?? []).map((scenario, index) => (
            <li className={styles.scenarioCard} key={scenario.key}>
              <span className={styles.launchIndex} aria-hidden="true">
                {String(index + 1).padStart(2, '0')}
              </span>
              <motion.h1
                // Only the card being launched carries the shared-element id:
                // two elements with one layoutId at the same time cannot animate.
                layoutId={
                  mutation.variables === scenario.key
                    ? 'investigation-question'
                    : undefined
                }
              >
                {scenario.question}
              </motion.h1>
              <div
                className={styles.scenarioFacts}
                aria-label="Scenario constraints"
              >
                {scenario.facts.map((fact) => (
                  <span key={fact}>{fact}</span>
                ))}
                <span>Governed metrics only</span>
              </div>
              <Button
                className={styles.launchButton}
                size="lg"
                loading={
                  mutation.isPending && mutation.variables === scenario.key
                }
                disabled={isViewer || mutation.isPending}
                onClick={() => mutation.mutate(scenario.key)}
              >
                {isViewer ? 'Viewer access · read only' : 'Begin evidence trace'}
              </Button>
            </li>
          ))}
        </ul>
        {scenarios.error ? (
          <p className={styles.error} role="alert">
            {scenarios.error.message}
          </p>
        ) : null}
        {mutation.error ? (
          <p className={styles.error} role="alert">
            {mutation.error.message}
          </p>
        ) : null}
      </div>
      <div className={styles.launchRule} aria-hidden="true">
        <span />
        <strong>Every claim rechecked before you see it</strong>
      </div>
    </section>
  );
};

const eventLabels: Record<string, string> = {
  'investigation.created': 'Question registered',
  'investigation.started': 'Governed query started',
  'investigation.evaluation_started': 'Validation opened',
  'investigation.validation_completed': 'Evidence validated',
  'human_approval.requested': 'Human judgment requested',
  'human_approval.granted': 'Human judgment recorded',
  'human_approval.rejected': 'Evidence rejected',
  'investigation.completed': 'Investigation completed',
  'investigation.rejected': 'Investigation rejected',
  'investigation.retry_requested': 'Recheck disagreed, retrying',
  'investigation.failed': 'Investigation failed',
  'agent.execution_completed': 'Agent step completed',
  'agent.execution_failed': 'Agent step failed',
};

const agentLabels: Record<string, string> = {
  orchestrator: 'Orchestrator',
  sql_analyst: 'SQL Analyst',
  evaluator: 'Evaluator',
};

const EvidenceSpine = ({
  investigation,
}: {
  readonly investigation: Investigation;
}) => {
  const reducedMotion = useReducedMotion();
  const resolved = investigation.status === 'completed';
  const rejected = investigation.status === 'rejected';
  return (
    <section className={styles.evidencePanel} aria-labelledby="evidence-title">
      <div className={styles.sectionKicker}>
        <span>Evidence trace</span>
        <span>
          {investigation.audit_delivery === 'complete'
            ? 'Ledger synchronized'
            : 'Ledger delivery pending'}
        </span>
      </div>
      <h2 id="evidence-title" className={styles.srOnly}>
        Persisted evidence timeline
      </h2>
      <div className={styles.spine}>
        <svg
          aria-hidden="true"
          className={styles.spineSvg}
          viewBox="0 0 8 100"
          preserveAspectRatio="none"
        >
          <motion.path
            d="M4 0 V100"
            initial={reducedMotion ? false : { pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={{ duration: reducedMotion ? 0 : 0.82, ease: 'easeOut' }}
            className={
              rejected
                ? styles.rejectedPath
                : resolved
                  ? styles.completedPath
                  : styles.activePath
            }
          />
        </svg>
        <ol>
          {investigation.timeline.map((entry, index) => (
            <motion.li
              key={entry.entry_id}
              initial={reducedMotion ? false : { opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{
                duration: 0.2,
                delay: reducedMotion ? 0 : Math.min(index * 0.07, 0.56),
              }}
            >
              <span className={styles.traceNode} aria-hidden="true" />
              <div>
                <strong>
                  {entry.agent_id
                    ? `${agentLabels[entry.agent_id.replace(/_v\d+$/, '')] ?? entry.agent_id}${
                        entry.step ? ` · step ${entry.step}` : ''
                      }`
                    : (eventLabels[entry.event_type] ?? entry.event_type)}
                </strong>
                {entry.model ? (
                  <small className={styles.stepModel}>{entry.model}</small>
                ) : null}
                <small>
                  {new Date(entry.created_at).toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit',
                    second: '2-digit',
                  })}
                  {entry.delivery === 'pending' ? ' · audit pending' : ''}
                </small>
              </div>
              <span>{entry.status.replace(/_/g, ' ')}</span>
            </motion.li>
          ))}
        </ol>
      </div>
    </section>
  );
};

const approvalHeadings: Record<string, string> = {
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
const conditionLabels: Record<string, string> = {
  converged: 'The independent recheck did not agree',
  confident: 'Bounded confidence is below the tenant threshold',
  evidenced: 'A substantive claim has no evidence that can be followed',
  uncontradicted: 'A contradiction is still open',
};

const OutcomePanel = ({
  investigation,
}: {
  readonly investigation: Investigation;
}) => {
  const outcome = investigation.outcome;
  if (!outcome) return null;

  if (outcome.kind === 'confidence') {
    const percent = Math.round(outcome.score * 100);
    return (
      <section className={styles.validation} aria-labelledby="outcome-title">
        <p className={styles.eyebrow}>Typed outcome · confidence</p>
        <h3 id="outcome-title">
          {investigation.pending_approval
            ? (approvalHeadings[investigation.pending_approval.reason] ??
              'Human judgment required')
            : 'Rechecked and cleared to publish'}
        </h3>
        <p className={styles.confidenceScore}>
          <strong>{percent}%</strong> confidence
        </p>
        <ul>
          <li>Calibrated by: {outcome.calibration_method.replace(/_/g, ' ')}</li>
          <li>
            Evaluation attempts: {investigation.evaluation_attempts} of 3
          </li>
          {outcome.calibration_method ===
          'capped_evaluator_shared_model_family' ? (
            <li className={styles.validationIssue}>
              ! The recheck ran on the same model family as the analysis, so it
              was not independent. Confidence is capped and this cannot publish
              without you.
            </li>
          ) : null}
        </ul>
      </section>
    );
  }

  return (
    <section className={styles.validation} aria-labelledby="outcome-title">
      <p className={styles.eyebrow}>Typed outcome · validation</p>
      <h3 id="outcome-title">
        {investigation.pending_approval
          ? (approvalHeadings[investigation.pending_approval.reason] ??
            'Human judgment required')
          : 'Validation passed'}
      </h3>
      <ul>
        {outcome.checks.map((check) => (
          <li key={check}>✓ {check}</li>
        ))}
        {outcome.issues.map((issue) => (
          <li className={styles.validationIssue} key={issue}>
            ! {issue}
          </li>
        ))}
      </ul>
    </section>
  );
};

const MetricField = ({ metric }: { readonly metric: MetricComparison }) => {
  const previous = Number(metric.previous_value);
  const current = Number(metric.current_value);
  const maximum = Math.max(previous, current, 1);
  return (
    <div className={styles.metricField}>
      <div className={styles.metricHeading}>
        <span>{metric.metric.replace(/_/g, ' ')}</span>
        <strong>
          {metric.unit === 'USD' ? '$' : ''}
          {metric.current_value}
          {metric.unit === 'percent' ? '%' : ''}
        </strong>
      </div>
      <div className={styles.metricBars} aria-label={`${metric.metric} comparison`}>
        <motion.span
          className={styles.previousBar}
          initial={{ scaleX: 0 }}
          animate={{ scaleX: previous / maximum }}
          transition={{ duration: 0.28 }}
        />
        <motion.span
          className={styles.currentBar}
          initial={{ scaleX: 0 }}
          animate={{ scaleX: current / maximum }}
          transition={{ duration: 0.32, delay: 0.08 }}
        />
      </div>
      {/* The periods come from the agent that chose the granularity. They were
          once hardcoded to June and July from the one scenario that existed,
          and captioned an October-to-November finding with the wrong months the
          first time a second scenario ran. Where the agent named no period we
          render none: a metric that cannot say what it compares says nothing
          about it. */}
      <small>
        {metric.previous_label && metric.current_label ? (
          <>
            {metric.previous_label} {metric.previous_value} → {metric.current_label}{' '}
            {metric.current_value} {metric.unit}
          </>
        ) : (
          <>
            {metric.previous_value} → {metric.current_value} {metric.unit}
          </>
        )}
      </small>
    </div>
  );
};

/**
 * What the reviewer is being asked to judge, in the place they judge it.
 *
 * The Draft Finding panel is elsewhere on the page; a reviewer scrolling back
 * and forth between the decision and the evidence is a reviewer who might not.
 * These are the four things a decision turns on — how far the evidence can be
 * trusted, whether anything is still disputed, how many claims are followable,
 * and whether any of them are not.
 */
const ApprovalEvidence = ({
  investigation,
}: {
  readonly investigation: Investigation;
}) => {
  const draft = investigation.draft_finding;
  if (!draft) {
    // Said, not omitted. A reviewer seeing no evidence block would not know
    // whether there is nothing to show or whether it failed to load.
    return (
      <p className={styles.consequence}>
        This investigation predates structured claims. There is no claim-level
        evidence to review; judge it from the narrative finding above.
      </p>
    );
  }

  const observed = draft.claims.filter((claim) => claim.kind === 'observed');
  // Resolved from the payload the page already holds, not fetched on demand:
  // a reviewer must not be able to decide before the evidence has answered.
  //
  // Lost and deliberately erased are counted apart. Collapsing them would tell
  // a reviewer their data is missing when a Tenant asked for it to go.
  const unavailable = draft.citations.filter((c) => c.state === 'unavailable');
  const tombstoned = draft.citations.filter((c) => c.state === 'tombstoned');

  return (
    <dl className={styles.approvalEvidence}>
      <dt>Confidence</dt>
      <dd>
        {draft.confidence
          ? `${Math.round(draft.confidence.score * 100)}% · ${draft.confidence.calibration_method.replace(/_/g, ' ')}`
          : 'Not reported'}
      </dd>
      <dt>Measured claims</dt>
      <dd>
        {observed.length} of {draft.claims.length}
      </dd>
      <dt>Evidence</dt>
      <dd>
        {unavailable.length === 0 && tombstoned.length === 0
          ? `${draft.citations.length} citations, all resolvable`
          : [
              unavailable.length > 0
                ? `${unavailable.length} of ${draft.citations.length} cannot be followed`
                : null,
              tombstoned.length > 0
                ? `${tombstoned.length} erased at the tenant's request`
                : null,
            ]
              .filter(Boolean)
              .join(' · ')}
      </dd>
      <dt>Contradictions</dt>
      <dd>
        {draft.contradictions.filter((c) => !c.resolved).length === 0
          ? 'None open'
          : draft.contradictions
              .filter((c) => !c.resolved)
              .map((c) => c.detail)
              .join('; ')}
      </dd>
      <dt>Root cause</dt>
      {/* Read from the draft rather than asserted. The API's literal is
          `unresolved` today; hardcoding the copy would make this row lie the
          day a causal-evidence standard widens it. */}
      <dd>
        {draft.root_cause === 'unresolved'
          ? 'Unresolved — the evidence shows what changed, not why'
          : draft.root_cause}
      </dd>
    </dl>
  );
};

const ApprovalInspector = ({
  investigation,
  onDecision,
  pending,
}: {
  readonly investigation: Investigation;
  readonly onDecision: (
    decision: 'approve' | 'reject',
    reason: RejectionReason | null,
  ) => void;
  readonly pending: boolean;
}) => {
  const approval = investigation.pending_approval;
  const headingRef = useRef<HTMLHeadingElement>(null);
  const [reason, setReason] =
    useState<RejectionReason>('insufficient_evidence');
  useEffect(() => {
    if (approval) {
      headingRef.current?.focus();
    }
  }, [approval]);

  if (!approval) {
    return (
      <aside className={styles.resolutionInspector} aria-live="polite">
        <p className={styles.eyebrow}>Resolution</p>
        <h2>
          {investigation.status === 'completed'
            ? 'Approved and complete'
            : investigation.status === 'rejected'
              ? 'Rejected with cause'
              : 'No decision required'}
        </h2>
        <p>
          The persisted evidence beam has reached a terminal state. No hidden
          rationale was recorded.
        </p>
      </aside>
    );
  }

  return (
    <motion.aside
      className={styles.approvalInspector}
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 12 }}
      transition={{ duration: 0.24 }}
      aria-labelledby="approval-heading"
    >
      <p className={styles.eyebrow}>Human Approval · required</p>
      <h2 id="approval-heading" ref={headingRef} tabIndex={-1}>
        {approvalHeadings[approval.reason] ?? 'Human judgment required'}
      </h2>
      {/* Every condition the policy found failing, not just the heading's.
          Deciding on the headline alone is deciding on part of the picture —
          and the copy here used to describe one scenario's sample size
          regardless of why the gate actually opened. */}
      {approval.failed_conditions.length > 0 ? (
        <ul className={styles.failedConditions}>
          {approval.failed_conditions.map((condition) => (
            <li key={condition}>
              {conditionLabels[condition] ?? condition.replace(/_/g, ' ')}
            </li>
          ))}
        </ul>
      ) : (
        <p>Tenant policy requires a human to accept or reject this finding.</p>
      )}

      <ApprovalEvidence investigation={investigation} />

      {/* Said before the buttons, not after. A reviewer should know what
          approving does while deciding, not discover it afterwards. */}
      <p className={styles.consequence}>
        Approving publishes this finding to everyone in the tenant. Rejecting
        records your reason and closes the investigation without publishing.
        Either way the evidence, the decision and who made it stay in Replay.
      </p>
      {approval.can_decide ? (
        <div className={styles.decisionControls}>
          <Button
            className={styles.approveButton}
            loading={pending}
            onClick={() => onDecision('approve', null)}
          >
            Approve finding
          </Button>
          <label>
            If rejecting, record a structured reason
            <select
              value={reason}
              onChange={(event) =>
                setReason(event.target.value as RejectionReason)
              }
            >
              <option value="insufficient_evidence">
                Insufficient evidence
              </option>
              <option value="incorrect_interpretation">
                Incorrect interpretation
              </option>
              <option value="policy_mismatch">Policy mismatch</option>
              <option value="needs_more_analysis">Needs more analysis</option>
            </select>
          </label>
          <Button
            className={styles.rejectButton}
            intent="danger"
            disabled={pending}
            onClick={() => onDecision('reject', reason)}
          >
            Reject finding
          </Button>
        </div>
      ) : (
        <p className={styles.readOnlyNotice}>
          Owner or admin judgment is required. Your membership is read only for
          this gate.
        </p>
      )}
    </motion.aside>
  );
};

const InvestigationWorkspace = ({
  getToken,
}: {
  readonly getToken: TokenSource;
}) => {
  const { id } = useParams();
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ['investigation', id],
    queryFn: () =>
      requestJson<Investigation>(`/v1/investigations/${id}`, getToken),
    enabled: Boolean(id),
    refetchInterval: (result) => {
      const data = result.state.data;
      if (!data) return false;
      const settled =
        data.status === 'completed' ||
        data.status === 'rejected' ||
        data.status === 'failed' ||
        data.status === 'cancelled';
      // Keep polling while the agents are still working, and afterwards until
      // the ledger has caught up with what already happened.
      return !settled || data.audit_delivery === 'pending' ? 1500 : false;
    },
  });
  const decision = useMutation({
    mutationFn: ({
      choice,
      reason,
    }: {
      choice: 'approve' | 'reject';
      reason: RejectionReason | null;
    }) => {
      const approval = query.data?.pending_approval;
      if (!approval || !id) {
        throw new Error('This approval is no longer available.');
      }
      return requestJson<Investigation>(
        `/v1/investigations/${id}/approvals/${approval.approval_id}/decision`,
        getToken,
        {
          method: 'POST',
          body: JSON.stringify({ decision: choice, reason }),
        },
      );
    },
    onSuccess: (investigation) =>
      queryClient.setQueryData(['investigation', id], investigation),
  });

  if (query.isPending) {
    return (
      <section className={styles.loadingWorkspace} aria-live="polite">
        <span className={styles.loadingLine} />
        <p>Loading persisted evidence…</p>
      </section>
    );
  }
  if (query.error || !query.data) {
    return (
      <section className={styles.loadingWorkspace}>
        <p className={styles.error} role="alert">
          {query.error?.message ?? 'Investigation was not found.'}
        </p>
        <Link to="/">Return to the launcher</Link>
      </section>
    );
  }

  const investigation = query.data;
  return (
    <div
      className={styles.investigation}
      data-resolution={investigation.status}
    >
      <header className={styles.investigationHeader}>
        <div>
          <p className={styles.eyebrow}>
            Investigation · {investigation.investigation_id.slice(0, 8)}
          </p>
          <motion.h1 layoutId="investigation-question">
            {investigation.canonical_question}
          </motion.h1>
        </div>
        <div className={styles.statusLockup} aria-live="polite">
          <span className={styles.statusGlyph} aria-hidden="true" />
          <div>
            <small>Current state</small>
            <strong>{investigation.status.replace(/_/g, ' ')}</strong>
          </div>
        </div>
      </header>

      <div className={styles.investigationGrid}>
        <EvidenceSpine investigation={investigation} />
        <article className={styles.findingCanvas}>
          <div className={styles.sectionKicker}>
            <span>Finding preview</span>
            <span>Evaluation {investigation.evaluation_attempts} / 3</span>
          </div>
          {investigation.finding ? (
            <>
              <h2>{investigation.finding.headline}</h2>
              <p className={styles.findingSummary}>
                {investigation.finding.summary}
              </p>
              <div className={styles.metrics}>
                {investigation.finding.metrics.map((metric) => (
                  <MetricField key={metric.metric} metric={metric} />
                ))}
              </div>
              {investigation.draft_finding ? (
                <DraftFindingPanel
                  draft={investigation.draft_finding}
                  investigationId={investigation.investigation_id}
                />
              ) : (
                <LegacyFindingNotice />
              )}
              <OutcomePanel investigation={investigation} />
              <footer className={styles.artifact}>
                <span>Evidence reference</span>
                <code>{investigation.finding.evidence_references[0]}</code>
              </footer>
            </>
          ) : null}
        </article>
        <AnimatePresence mode="wait">
          <ApprovalInspector
            key={
              investigation.pending_approval?.approval_id ??
              investigation.status
            }
            investigation={investigation}
            pending={decision.isPending}
            onDecision={(choice, reason) =>
              decision.mutate({ choice, reason })
            }
          />
        </AnimatePresence>
      </div>
      {decision.error ? (
        <p className={styles.decisionError} role="alert">
          {decision.error.message}
        </p>
      ) : null}
    </div>
  );
};

const AuthenticatedWorkspace = () => {
  const { logout, tenant } = useAuth();
  const { getAccessToken } = useAuthSession();
  const getToken = useCallback<TokenSource>(
    () => getAccessToken({ audience: 'first_party_http' }),
    [getAccessToken],
  );
  const readiness = useQuery({
    queryKey: ['readiness'],
    queryFn: requestReadiness,
    enabled: Boolean(tenant?.id),
    retry: false,
  });
  const identity = useQuery({
    queryKey: ['identity-context', tenant?.id],
    queryFn: () => requestJson<IdentityContext>('/v1/context', getToken),
    enabled: Boolean(tenant?.id),
    retry: false,
  });

  if (!tenant?.id) {
    return (
      <main className={styles.entryPage}>
        <ProductMark />
        <Button intent="ghost" onClick={() => void logout()}>
          Sign out
        </Button>
        <section className={styles.entryHero}>
          <p className={styles.eyebrow}>Organization required</p>
          <h1>Select a Clerk organization to continue.</h1>
          <p>ZentraOS never falls back to a caller-supplied tenant.</p>
        </section>
      </main>
    );
  }

  if (identity.isPending) {
    return (
      <main className={styles.centered} aria-live="polite">
        <ProductMark />
        <span className={styles.loadingLine} />
        <p>Resolving governed tenant context…</p>
      </main>
    );
  }

  if (identity.error || !identity.data) {
    return (
      <main className={styles.entryPage}>
        <ProductMark />
        <section className={styles.entryHero}>
          <p className={styles.eyebrow}>Membership unavailable</p>
          <h1>This organization is not bound to a ZentraOS tenant.</h1>
          <p>{identity.error?.message}</p>
        </section>
      </main>
    );
  }

  return (
    <ObservatoryShell
      identity={identity.data}
      readiness={readiness.data}
    >
      <Routes>
        <Route
          path="/"
          element={<Launcher getToken={getToken} identity={identity.data} />}
        />
        <Route
          path="/investigations/:id"
          element={<InvestigationWorkspace getToken={getToken} />}
        />
        <Route path="*" element={<Navigate replace to="/" />} />
      </Routes>
    </ObservatoryShell>
  );
};

const AuthenticatedEntry = () => {
  const { isAuthenticated, isInitializing, login } = useAuth();

  if (isInitializing) {
    return (
      <main className={styles.centered}>
        <ProductMark />
        <p>Resolving your identity…</p>
      </main>
    );
  }
  if (!isAuthenticated) {
    return <SignedOut login={() => login()} />;
  }
  return <AuthenticatedWorkspace />;
};

export function App({ clerkConfigured = false }: AppProps) {
  return clerkConfigured ? <AuthenticatedEntry /> : <SetupRequired />;
}

export default App;
