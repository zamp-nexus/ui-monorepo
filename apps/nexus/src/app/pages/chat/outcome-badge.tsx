/**
 * The typed outcome the evaluator recorded, compacted for inline display
 * beside a Finding's answer.
 *
 * `OutcomePanel` (removed with the standalone Analysis Run page in #117) said
 * the same thing at section length; this says it in a row a reader passes on
 * the way to the answer rather than a stop of its own.
 */

import { Badge } from '@open-zentra/foundation-design-system';

import type { ThreadAnalysisRun } from '../../types';

export const OutcomeBadge = ({
  outcome,
}: {
  readonly outcome: ThreadAnalysisRun['outcome'];
}) => {
  if (!outcome) return null;

  if (outcome.kind === 'confidence') {
    const percent = Math.round(outcome.score * 100);
    // The recheck ran on the same model family as the analysis, so it was not
    // independent -- said out loud rather than left for a reader to infer
    // from the calibration method's own vocabulary.
    const capped = outcome.calibration_method === 'capped_evaluator_shared_model_family';
    return (
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Badge intent={capped ? 'warning' : 'default'} size="sm">
          Confidence {percent}% · {outcome.calibration_method.replace(/_/g, ' ')}
        </Badge>
        {capped ? (
          <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-warning">
            Not an independent recheck
          </span>
        ) : null}
      </div>
    );
  }

  return (
    <div className="mt-3 flex flex-wrap items-center gap-2">
      <Badge intent={outcome.passed ? 'success' : 'warning'} size="sm">
        Validation {outcome.passed ? 'passed' : 'flagged'}
      </Badge>
      {outcome.issues.map((issue) => (
        <Badge key={issue} intent="warning" size="sm">
          {issue}
        </Badge>
      ))}
    </div>
  );
};
