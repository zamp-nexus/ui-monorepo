import { Badge } from '@open-zentra/foundation-design-system';

import styles from './draft-finding-panel.module.scss';

export interface Claim {
  readonly claim_id: string;
  readonly kind: 'observed' | 'interpretation';
  readonly text: string;
  readonly position: number;
  // The measurement behind an observed claim. Null on an interpretation,
  // which is a reading of someone else's measurement.
  readonly metric: string | null;
  readonly value: string | null;
  readonly period: string | null;
  readonly citation_ids: readonly string[];
}

export interface CitationFilter {
  readonly member: string;
  readonly operator: string;
  readonly values: readonly string[];
}

export interface EvidenceCitation {
  readonly citation_id: string;
  readonly metric: string;
  readonly filters: readonly CitationFilter[];
  readonly period: string | null;
  readonly grain: string | null;
  readonly producing_execution_id: string | null;
  readonly aggregate_value: string;
  readonly state: 'active' | 'unavailable' | 'tombstoned';
}

export interface DraftFinding {
  readonly draft_finding_id: string;
  readonly version: number;
  readonly created_at: string;
  readonly produced_by_execution_id: string | null;
  readonly headline: string;
  readonly summary: string;
  readonly claims: readonly Claim[];
  readonly contradictions: readonly {
    readonly detail: string;
    readonly resolved: boolean;
  }[];
  readonly root_cause: 'unresolved';
  readonly confidence: {
    readonly score: number;
    readonly calibration_method: string;
  } | null;
  // Shared across claims, so they arrive once. A claim's `citation_ids` index
  // into these.
  readonly citations: readonly EvidenceCitation[];
}

const claimLabels: Record<Claim['kind'], string> = {
  observed: 'Measured',
  interpretation: 'Interpretation',
};

/**
 * Says, in as many words, that this Investigation predates structured claims.
 *
 * Silence would read as "no evidence here", which is a harsher and less true
 * statement than "this one ran before claims were separable".
 */
export function LegacyFindingNotice() {
  return (
    <p className={styles.legacyNotice} data-state="legacy">
      This Investigation ran before claims were recorded separately. Its
      conclusion is narrative, and it carries no Evidence Citations to follow
      to individual claims.
    </p>
  );
}

/**
 * The evidence behind one claim, as a disclosure rather than a link.
 *
 * A `<details>` because the reader is choosing to inspect evidence, not
 * navigate away — and because it is keyboard-operable and announced without
 * any scripting to get wrong.
 */
function CitationDisclosure({
  citations,
  claimText,
}: {
  citations: readonly EvidenceCitation[];
  claimText: string;
}) {
  if (citations.length === 0) return null;

  return (
    <details className={styles.evidence}>
      <summary>
        Evidence
        <span className={styles.srOnly}> for: {claimText}</span>
      </summary>
      <ul>
        {citations.map((citation) => (
          <li key={citation.citation_id}>
            <dl>
              <dt>Metric</dt>
              <dd>{citation.metric}</dd>
              <dt>Value</dt>
              <dd>{citation.aggregate_value}</dd>
              {citation.period ? (
                <>
                  <dt>Period</dt>
                  <dd>{citation.period}</dd>
                </>
              ) : null}
              {citation.grain ? (
                <>
                  <dt>Grain</dt>
                  <dd>{citation.grain}</dd>
                </>
              ) : null}
              {citation.filters.length > 0 ? (
                <>
                  <dt>Filters</dt>
                  <dd>
                    {citation.filters
                      .map(
                        (filter) =>
                          `${filter.member} ${filter.operator} ${filter.values.join(', ')}`,
                      )
                      .join('; ')}
                  </dd>
                </>
              ) : null}
            </dl>
          </li>
        ))}
      </ul>
    </details>
  );
}

export function DraftFindingPanel({ draft }: { draft: DraftFinding }) {
  const headingId = `draft-${draft.draft_finding_id}`;
  const unresolved = draft.contradictions.filter((c) => !c.resolved);
  const byId = new Map(draft.citations.map((c) => [c.citation_id, c]));

  return (
    <section
      className={styles.draft}
      data-state="structured"
      aria-labelledby={headingId}
    >
      <h3 id={headingId} className={styles.srOnly}>
        Draft finding claims
      </h3>

      <ol className={styles.claims}>
        {draft.claims.map((claim) => (
          <li key={claim.claim_id} className={styles.claim}>
            {/* The label is text, not a colour. A reader who cannot
                distinguish the two swatches still gets the distinction. */}
            <Badge
              intent={claim.kind === 'observed' ? 'success' : 'default'}
              size="sm"
            >
              {claimLabels[claim.kind]}
            </Badge>
            <div>
              <p>{claim.text}</p>
              {/* Shown, not implied. A reader should be able to see the
                  figure a claim rests on without following anything. */}
              {claim.metric && claim.value ? (
                <p className={styles.measurement}>
                  <span>{claim.metric}</span>
                  <span>{claim.value}</span>
                  {claim.period ? <span>{claim.period}</span> : null}
                </p>
              ) : null}
              <CitationDisclosure
                claimText={claim.text}
                citations={claim.citation_ids
                  .map((id) => byId.get(id))
                  .filter((c): c is EvidenceCitation => c !== undefined)}
              />
            </div>
          </li>
        ))}
      </ol>

      {unresolved.length > 0 ? (
        <div className={styles.contradictions} role="note">
          <span className={styles.contradictionLabel}>
            Unresolved contradiction{unresolved.length > 1 ? 's' : ''}
          </span>
          <ul>
            {unresolved.map((contradiction) => (
              <li key={contradiction.detail}>{contradiction.detail}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {/* Unconditional. Phase 2 admits no other root-cause state, and
          ADR 0011 turns on the product saying this out loud rather than
          leaving causality to be assumed. */}
      <p className={styles.rootCause}>
        Root cause unresolved — the evidence shows what changed, not why.
      </p>
    </section>
  );
}
