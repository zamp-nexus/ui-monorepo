import { m } from 'motion/react';

const EXECUTION_STAGES = [
  ['01', 'Scope', 'complete'],
  ['02', 'Analyze', 'complete'],
  ['03', 'Verify', 'complete'],
  ['04', 'Approve', 'active'],
] as const;

const RUN_NAVIGATION = ['Run', 'Data', 'Models', 'Audit'] as const;

const EVIDENCE_REFERENCES = [
  ['E-01', 'Refund events'],
  ['E-02', 'Carrier policy'],
  ['E-03', 'Regional mix'],
  ['E-04', 'Evaluator query'],
] as const;

export const ExecutionVisual = () => (
  <figure className="execution-visual" aria-labelledby="execution-caption">
    <div className="execution-visual__bar">
      <span className="window-controls" aria-hidden="true">
        <i />
        <i />
        <i />
      </span>
      <span>Analysis run / 0184</span>
      <span className="live-status">
        <span aria-hidden="true" /> Live · 02.48s
      </span>
    </div>
    <div className="execution-visual__workspace">
      <aside className="execution-sidebar" aria-label="Run navigation">
        <span className="execution-sidebar__brand">NX</span>
        {RUN_NAVIGATION.map((item, index) => (
          <span className={index === 0 ? 'is-active' : ''} key={item}>
            <i aria-hidden="true" /> {item}
          </span>
        ))}
      </aside>
      <div className="execution-main">
        <div className="execution-context">
          <div>
            <span className="ui-label">Question</span>
            <strong>Why did EU refunds increase in July?</strong>
          </div>
          <span className="scope-chip">finance_warehouse · governed</span>
        </div>
        <ol className="execution-stages" aria-label="Governed execution stages">
          {EXECUTION_STAGES.map(([index, label, status], position) => (
            <m.li
              className={`is-${status}`}
              key={label}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.35 + position * 0.08, duration: 0.4 }}
            >
              <span>{index}</span>
              <strong>{label}</strong>
              <i aria-hidden="true" />
            </m.li>
          ))}
        </ol>
        <div className="execution-finding">
          <div className="finding-primary">
            <div className="finding-primary__header">
              <span className="ui-label">Verified finding</span>
              <span className="confidence-badge">91% confidence</span>
            </div>
            <h3>Refunds rose after a regional carrier policy change.</h3>
            <p>Evaluator independently reproduced the increase across four evidence references.</p>
            <div className="finding-chart" aria-label="Illustrative refund trend from June to July">
              <div className="finding-chart__labels">
                <span>Refund rate</span>
                <strong>+18.4%</strong>
              </div>
              <svg viewBox="0 0 420 92" role="img" aria-label="Refund rate increases in July">
                <path className="chart-grid" d="M0 18H420M0 46H420M0 74H420" />
                <path
                  className="chart-area"
                  d="M0 70C55 66 86 68 126 61S202 59 250 53 320 44 420 18V92H0Z"
                />
                <m.path
                  className="chart-line"
                  d="M0 70C55 66 86 68 126 61S202 59 250 53 320 44 420 18"
                  initial={{ pathLength: 0 }}
                  animate={{ pathLength: 1 }}
                  transition={{ delay: 0.55, duration: 1.1, ease: 'easeOut' }}
                />
                <circle cx="420" cy="18" r="4" />
              </svg>
              <div className="finding-chart__axis">
                <span>Jun 01</span>
                <span>Jul 31</span>
              </div>
            </div>
          </div>
          <aside className="evidence-panel">
            <span className="ui-label">Evidence</span>
            {EVIDENCE_REFERENCES.map(([id, label]) => (
              <div key={id}>
                <span>{id}</span>
                <strong>{label}</strong>
                <i aria-hidden="true">↗</i>
              </div>
            ))}
          </aside>
        </div>
        <div className="approval-bar">
          <span>
            <i aria-hidden="true">✓</i> Independent evaluation converged
          </span>
          <strong>
            Ready for human approval <span aria-hidden="true">→</span>
          </strong>
        </div>
      </div>
    </div>
    <figcaption id="execution-caption" className="sr-only">
      A governed Nexus run moving from scoped data through orchestration, independent evaluation,
      human approval, and an evidence-backed finding.
    </figcaption>
  </figure>
);
