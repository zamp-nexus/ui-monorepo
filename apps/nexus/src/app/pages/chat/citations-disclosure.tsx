/**
 * The Analysis Run's evidence, expandable in place.
 *
 * `EvidenceSpine`/`CitationDetail` on the removed standalone Analysis Run
 * page (#117) put a citation's detail one navigation away; this stays on the
 * chat route the whole time. Listing is free -- `analysisRun.citations` is
 * already on the payload -- but a citation's full detail (and whether it
 * resolves to a tombstone) is only known once it's asked for, the same
 * Tenant-authorized read `VisualizationAnswer` already makes for a citation
 * a claim links to.
 */

import { useState } from 'react';

import { useQuery } from '@tanstack/react-query';

import { Icon } from '@open-zentra/foundation-icons';

import type { TokenSource } from '../../api';
import type { EvidenceCitation } from '../../types';
import { resolveCitation } from './api';
import { CitationDetail } from './citation-detail';

const STATE_LABEL: Record<EvidenceCitation['state'], string> = {
  active: '',
  unavailable: ' · unavailable',
  tombstoned: ' · erased',
};

export const CitationsDisclosure = ({
  getToken,
  analysisRunId,
  citations,
}: {
  readonly getToken: TokenSource;
  readonly analysisRunId: string;
  readonly citations: readonly EvidenceCitation[];
}) => {
  const [expanded, setExpanded] = useState(false);
  const [openCitationId, setOpenCitationId] = useState<string | null>(null);

  const detail = useQuery({
    queryKey: ['citation', analysisRunId, openCitationId],
    enabled: openCitationId !== null,
    queryFn: () => resolveCitation(getToken, analysisRunId, openCitationId as string),
  });

  if (citations.length === 0) return null;

  return (
    <div className="mt-4">
      <button
        type="button"
        onClick={() => setExpanded((value) => !value)}
        aria-expanded={expanded}
        className="flex items-center gap-2 border-0 bg-transparent p-0 font-mono text-[10px] uppercase tracking-[0.14em] text-foreground-muted hover:text-foreground"
      >
        <Icon name={expanded ? 'chevron_down' : 'chevron_right'} size="sm" />
        {citations.length} citation{citations.length === 1 ? '' : 's'}
      </button>

      {expanded ? (
        <ul className="mt-2 flex list-none flex-col gap-1 p-0">
          {citations.map((citation) => (
            <li key={citation.citation_id}>
              <button
                type="button"
                onClick={() => setOpenCitationId(citation.citation_id)}
                className="cursor-pointer border-0 bg-transparent p-0 font-mono text-sm text-primary underline"
              >
                {citation.metric} · {citation.aggregate_value}
                {STATE_LABEL[citation.state]}
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      {openCitationId && detail.data ? (
        <CitationDetail citation={detail.data} onClose={() => setOpenCitationId(null)} />
      ) : null}
    </div>
  );
};
