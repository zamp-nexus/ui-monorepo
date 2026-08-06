import { m } from 'motion/react';

const EXECUTION_STAGES = [
  ['01', 'Data', 'Scope locked'],
  ['02', 'Orchestrator', 'Plan accepted'],
  ['03', 'Analyst', 'Query complete'],
  ['04', 'Evaluator', 'Recheck converged'],
  ['05', 'Human approval', 'Decision recorded'],
  ['06', 'Finding', 'Evidence attached'],
] as const;

export const ExecutionVisual = () => (
  <figure className="execution-visual" aria-labelledby="execution-caption">
    <div className="execution-visual__bar">
      <span className="live-status">
        <span aria-hidden="true" /> Run 0184
      </span>
      <span>governed_analysis.workflow</span>
      <span>02.48s</span>
    </div>
    <div className="execution-visual__query">
      <span>Question</span>
      <strong>Why did EU refunds increase in July?</strong>
      <span className="query-scope">Scope · finance_warehouse / governed</span>
    </div>
    <ol className="execution-rail">
      {EXECUTION_STAGES.map(([index, label, status], position) => (
        <m.li
          key={label}
          initial={{ opacity: 0, x: -12 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.45 + position * 0.1, duration: 0.45 }}
        >
          <span className="execution-rail__index">{index}</span>
          <span className="execution-rail__node" aria-hidden="true" />
          <strong>{label}</strong>
          <span>{status}</span>
        </m.li>
      ))}
    </ol>
    <div className="execution-visual__footer">
      <span>Evidence 04</span>
      <span>Models 03</span>
      <span>Confidence 0.91</span>
      <span className="verified-label">Verified</span>
    </div>
    <figcaption id="execution-caption" className="sr-only">
      A governed Nexus run moving from scoped data through orchestration, independent evaluation,
      human approval, and an evidence-backed finding.
    </figcaption>
  </figure>
);
