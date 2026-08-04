/**
 * The `analysis-run-finding` tool call: what the agents produced, rendered
 * as the assistant's turn.
 *
 * There is no message behind this. A published Finding lives on the
 * Analysis Run, so the headline and summary are read from there and the
 * generated view is rendered beneath them. Until the Analysis Run is
 * terminal the row still exists -- saying which state it is in is more
 * useful than showing nothing while agents work.
 *
 * Cancel/retry render only on the latest Analysis Run (`result.isLatest`):
 * `thread.actions.can_cancel`/`can_retry` describe the one Analysis Run that
 * can currently be acted on, not any Analysis Run in the Thread's history.
 * The pending-approval decision, by contrast, is read straight off this
 * Analysis Run's own `approval` -- that already only exists on the one
 * actually awaiting it.
 */

import { useState } from 'react';

import type { ToolCallMessagePartComponent } from '@assistant-ui/react';
import { useMutation, useQueryClient } from '@tanstack/react-query';

import { Badge, Button, Card, Select } from '@open-zentra/foundation-design-system';
import { Icon } from '@open-zentra/foundation-icons';

import { AgentActivityBlock } from './agent-activity-block';
import { cancelAnalysisRun, decideApproval, retryAnalysisRun } from './api';
import { useChatContext } from './chat-context';
import { CitationsDisclosure } from './citations-disclosure';
import { OutcomeBadge } from './outcome-badge';
import type { AnalysisRunFindingResult } from './to-chat-message';
import { VisualizationAnswer } from './visualization-answer';

/** Statuses a reader should read as "this turn is done", not "still working". */
const TERMINAL_STATUSES = new Set(['completed', 'rejected', 'failed', 'cancelled']);

const WORKING: Record<string, string> = {
  pending: 'Queued.',
  running: 'Reading governed metrics…',
  evaluating: 'Rechecking the result independently…',
  awaiting_approval: 'Waiting for a decision before this can be published.',
};

const STOPPED: Record<string, string> = {
  failed: 'This analysis run could not be completed.',
  cancelled: 'This analysis run was stopped.',
  rejected: 'This draft was rejected, so no Finding was published.',
};

const REJECTION_REASONS: readonly { value: string; label: string }[] = [
  { value: 'insufficient_evidence', label: 'Insufficient evidence' },
  { value: 'incorrect_interpretation', label: 'Incorrect interpretation' },
  { value: 'policy_mismatch', label: 'Policy mismatch' },
  { value: 'needs_more_analysis', label: 'Needs more analysis' },
];

export const AnalysisRunFindingMessage: ToolCallMessagePartComponent<
  { analysisRunId: string },
  AnalysisRunFindingResult
> = ({ result }) => {
  const { getToken, onFollowUp, activityByRun, agents } = useChatContext();
  const queryClient = useQueryClient();
  const [reason, setReason] = useState(REJECTION_REASONS[0].value);

  const refresh = (threadId: string) =>
    queryClient.invalidateQueries({ queryKey: ['thread', threadId] });

  const cancel = useMutation({
    mutationFn: () => cancelAnalysisRun(getToken, result!.analysisRun.analysis_run_id),
    onSuccess: () => refresh(result!.threadId),
  });
  const retry = useMutation({
    mutationFn: () => retryAnalysisRun(getToken, result!.analysisRun.analysis_run_id),
    onSuccess: () => refresh(result!.threadId),
  });
  const decision = useMutation({
    mutationFn: (choice: 'approve' | 'reject') => {
      const approval = result?.analysisRun.approval;
      if (!result || !approval) throw new Error('This approval is no longer available.');
      return decideApproval(
        getToken,
        result.analysisRun.analysis_run_id,
        approval.approval_id,
        choice,
        choice === 'reject' ? reason : null,
      );
    },
    onSuccess: () => refresh(result!.threadId),
  });

  if (!result) return null;
  const { analysisRun, isLatest, threadActions } = result;
  const finding = analysisRun.finding;
  const working = WORKING[analysisRun.status];
  const stopped = STOPPED[analysisRun.status];
  const approval = analysisRun.approval;
  const awaitingDecision = approval?.can_decide === true && approval.decided_at === null;
  const controlsError = cancel.error ?? retry.error ?? decision.error;

  return (
    <div className="flex gap-4">
      <span
        className="mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-sm bg-primary/10 text-primary"
        aria-hidden="true"
      >
        <Icon name="sparkles" size="sm" />
      </span>

      <div className="min-w-0 flex-1">
        <AgentActivityBlock
          events={activityByRun.get(analysisRun.analysis_run_id) ?? []}
          agents={agents}
          finalized={TERMINAL_STATUSES.has(analysisRun.status)}
        />

        {finding ? (
          <>
            <h2 className="font-serif text-xl font-normal leading-tight tracking-[-0.02em]">
              {finding.headline}
            </h2>
            <p className="mt-3 text-sm leading-relaxed text-foreground-muted">{finding.summary}</p>
          </>
        ) : null}

        <OutcomeBadge outcome={analysisRun.outcome} />

        <CitationsDisclosure
          getToken={getToken}
          analysisRunId={analysisRun.analysis_run_id}
          citations={analysisRun.citations ?? []}
        />

        {working ? (
          <p
            className="font-mono text-[10px] uppercase tracking-[0.14em] text-foreground-muted"
            aria-live="polite"
          >
            {working}
          </p>
        ) : null}

        {stopped ? (
          <Badge intent="warning" size="sm">
            {stopped}
          </Badge>
        ) : null}

        {/* The generated view, and the governed brief whenever it is absent. */}
        <VisualizationAnswer
          getToken={getToken}
          analysisRunId={analysisRun.analysis_run_id}
          onFollowUp={onFollowUp}
        />

        {isLatest && (awaitingDecision || threadActions.can_cancel || threadActions.can_retry) ? (
          <div className="mt-4 flex flex-col gap-3">
            {awaitingDecision && approval ? (
              <Card component="section" padding="md">
                <div className="flex flex-wrap items-center gap-3">
                  <Badge intent="warning" size="sm">
                    Awaiting your decision
                  </Badge>
                  <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-foreground-muted">
                    {approval.reason.replace(/_/g, ' ')}
                  </span>
                </div>

                {approval.failed_conditions.length > 0 ? (
                  <ul className="mt-3 flex list-none flex-col gap-1 p-0">
                    {approval.failed_conditions.map((condition) => (
                      <li
                        key={condition}
                        className="font-mono text-[10px] uppercase tracking-[0.14em] text-danger"
                      >
                        {condition.replace(/_/g, ' ')}
                      </li>
                    ))}
                  </ul>
                ) : null}

                <div className="mt-4 flex flex-wrap items-center gap-3">
                  <Button
                    intent="primary"
                    size="sm"
                    disabled={decision.isPending}
                    onClick={() => decision.mutate('approve')}
                  >
                    Approve
                  </Button>
                  <Select
                    value={reason}
                    onValueChange={setReason}
                  >
                    <Select.Trigger aria-label="Reason for rejecting" />
                    <Select.Content>
                      {REJECTION_REASONS.map((option) => (
                        <Select.Item key={option.value} value={option.value}>
                          {option.label}
                        </Select.Item>
                      ))}
                    </Select.Content>
                  </Select>
                  <Button
                    intent="danger"
                    size="sm"
                    disabled={decision.isPending}
                    onClick={() => decision.mutate('reject')}
                  >
                    Reject
                  </Button>
                </div>
              </Card>
            ) : null}

            <div className="flex flex-wrap gap-3">
              {threadActions.can_cancel ? (
                <Button
                  intent="ghost"
                  size="sm"
                  disabled={cancel.isPending || cancel.isSuccess}
                  onClick={() => cancel.mutate()}
                >
                  {cancel.isSuccess ? 'Stopping…' : 'Stop this analysis'}
                </Button>
              ) : null}
              {threadActions.can_retry ? (
                <Button
                  intent="ghost"
                  size="sm"
                  disabled={retry.isPending}
                  onClick={() => retry.mutate()}
                >
                  Try again
                </Button>
              ) : null}
            </div>

            {controlsError ? (
              <p className="text-sm text-danger" role="alert">
                {controlsError.message}
              </p>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
};
