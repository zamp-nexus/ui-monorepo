import { m } from 'motion/react';

const EXECUTION_STAGES = [
  ['01', 'Semantic scope', 'Resolved'],
  ['02', 'Analyst run', 'Complete'],
  ['03', 'Independent check', 'Converged'],
  ['04', 'Human decision', 'Required'],
] as const;

const EVIDENCE_REFERENCES = [
  ['E-01', 'Refund events', 'Reproduced'],
  ['E-02', 'Carrier policy', 'Attached'],
  ['E-03', 'Regional mix', 'Checked'],
] as const;

export const ExecutionVisual = () => (
  <figure className="execution-visual" aria-labelledby="execution-caption">
    <header className="execution-visual__bar">
      <span>Run / 0184</span>
      <span className="execution-visual__state"><i aria-hidden="true" /> Evaluation converged</span>
    </header>
    <div className="execution-visual__body">
      <div className="execution-question">
        <span>Question</span>
        <strong>Why did EU refunds increase in July?</strong>
        <em>finance_warehouse / governed</em>
      </div>

      <ol className="execution-stages" aria-label="Governed execution stages">
        {EXECUTION_STAGES.map(([index, label, status], position) => (
          <m.li
            key={label}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.22 + position * 0.1, duration: 0.38 }}
          >
            <span>{index}</span>
            <strong>{label}</strong>
            <em>{status}</em>
          </m.li>
        ))}
      </ol>

      <div className="execution-record">
        <article className="execution-finding">
          <div className="execution-finding__eyebrow">
            <span>Verified finding</span>
            <b>91% confidence</b>
          </div>
          <h3>Carrier-policy changes explain the July refund increase.</h3>
          <p>
            The analyst’s result was independently reproduced against the governed semantic query.
          </p>
          <div className="execution-signal" aria-label="Refund rate trend increasing from June to July">
            <span>Refund rate</span>
            <svg viewBox="0 0 420 70" role="img" aria-label="Refund rate increases in July">
              <path d="M0 54H420M0 28H420" />
              <m.path
                d="M0 57C65 53 94 55 145 48S242 47 293 35 354 25 420 8"
                initial={{ pathLength: 0 }}
                animate={{ pathLength: 1 }}
                transition={{ delay: 0.62, duration: 1.15, ease: 'easeOut' }}
              />
              <circle cx="420" cy="8" r="3.5" />
            </svg>
            <div><span>Jun 01</span><b>+18.4%</b><span>Jul 31</span></div>
          </div>
        </article>

        <aside className="evidence-register" aria-label="Evidence register">
          <span className="evidence-register__title">Evidence register</span>
          {EVIDENCE_REFERENCES.map(([id, label, state]) => (
            <div key={id}>
              <span>{id}</span>
              <strong>{label}</strong>
              <em>{state}</em>
            </div>
          ))}
          <p>+ 1 evaluator query</p>
        </aside>
      </div>

      <footer className="execution-approval">
        <span><i aria-hidden="true">✓</i> Independent evaluation converged</span>
        <strong>Human approval is the next boundary <b aria-hidden="true">→</b></strong>
      </footer>
    </div>
    <figcaption id="execution-caption" className="sr-only">
      An illustrative governed Nexus analysis run, showing the execution stages, verified finding,
      evidence register, and explicit human approval boundary.
    </figcaption>
  </figure>
);
