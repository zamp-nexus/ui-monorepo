/**
 * The generative-UI half of an answer.
 *
 * The governed brief is the whole answer -- every metric, every claim, every
 * citation, and the same safe actions -- not a degraded stand-in for some
 * other rendering. `fallback_brief` is null only before the pipeline has
 * produced one yet, or once its evidence has been erased.
 */

import { useState } from 'react';

import { useMutation, useQuery } from '@tanstack/react-query';

import { Button } from '@open-zentra/foundation-design-system';

import type { TokenSource } from '../../api';
import type { ResolvedCitation, VisualizationStatus } from '../../types';
import {
  executeVisualizationAction,
  getInvestigationVisualization,
  resolveCitation,
  retryVisualization,
} from './api';
import { BriefAnswer } from './brief-answer';
import { CitationDetail } from './citation-detail';

/** Why the reader is looking at a brief with no content yet, when relevant. */
const NOTICE: Partial<Record<VisualizationStatus, string>> = {
  pending: 'Preparing the governed brief.',
  generating: 'Preparing the governed brief.',
  failed: 'The brief could not be produced.',
  tombstoned: 'The rendered view was erased. This is the verified brief.',
};

export const VisualizationAnswer = ({
  getToken,
  investigationId,
  onFollowUp,
}: {
  readonly getToken: TokenSource;
  readonly investigationId: string;
  /** A `continue_conversation` action resolves to a message to send. */
  readonly onFollowUp: (message: string) => void;
}) => {
  const [citation, setCitation] = useState<ResolvedCitation | null>(null);

  const query = useQuery({
    queryKey: ['visualization', investigationId],
    queryFn: () => getInvestigationVisualization(getToken, investigationId),
    retry: false,
  });

  const visualization = query.data;

  const action = useMutation({
    mutationFn: (actionId: string) => {
      if (!visualization) throw new Error('This answer is no longer available.');
      return executeVisualizationAction(getToken, visualization.visualization_id, actionId);
    },
    onSuccess: async (result) => {
      // The server decided what the action meant. The button only named it.
      if (result.kind === 'open_citation' && result.citation_id) {
        setCitation(await resolveCitation(getToken, investigationId, result.citation_id));
        return;
      }
      if (result.kind === 'continue_conversation') {
        onFollowUp('Re-run this governed comparison with the latest data.');
      }
    },
  });

  const openCitation = useMutation({
    mutationFn: (citationId: string) => resolveCitation(getToken, investigationId, citationId),
    onSuccess: setCitation,
  });

  const retry = useMutation({
    mutationFn: () => {
      if (!visualization) throw new Error('This answer is no longer available.');
      return retryVisualization(getToken, visualization.visualization_id);
    },
    onSuccess: () => query.refetch(),
  });

  // An Investigation that produced no Finding has no visualization, and a 404
  // here is that — not a fault worth putting in front of a reader.
  if (query.isPending || query.error || !visualization) return null;

  const brief = visualization.fallback_brief;

  return (
    <div className="mt-4">
      {brief ? (
        <BriefAnswer
          brief={brief}
          notice={NOTICE[visualization.status] ?? null}
          actionPending={action.isPending}
          onAction={(actionId) => action.mutate(actionId)}
          onOpenCitation={(citationId) => openCitation.mutate(citationId)}
        />
      ) : null}

      {visualization.status === 'failed' ? (
        <Button
          className="mt-3"
          intent="ghost"
          size="sm"
          disabled={retry.isPending}
          onClick={() => retry.mutate()}
        >
          Render again
        </Button>
      ) : null}

      {citation ? <CitationDetail citation={citation} onClose={() => setCitation(null)} /> : null}
    </div>
  );
};
