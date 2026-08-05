/**
 * Talking to the Chat Session API.
 *
 * The chat surface creates analytical work only as a consequence of a Chat
 * Session message resolving to a governed scenario. It never posts to
 * `/v1/analysis-runs` — that is the older standalone flow the launcher uses,
 * and going through it directly would produce an Analysis Run no Chat
 * Session owns.
 */

import { requestJson, type TokenSource } from '../../api';
import type {
  Agent,
  Group,
  Page,
  ResolvedCitation,
  Thread,
  ThreadSummary,
  Visualization,
  VisualizationActionResult,
} from '../../types';

const post = (body?: unknown): RequestInit => ({
  method: 'POST',
  ...(body === undefined ? {} : { body: JSON.stringify(body) }),
});

/* -------------------------------------------------------------------------- */
/* Workspace                                                                   */
/* -------------------------------------------------------------------------- */

export const listGroups = (getToken: TokenSource) =>
  requestJson<Page<Group>>('/v1/groups', getToken);

export const createGroup = (getToken: TokenSource, name: string) =>
  requestJson<Group>('/v1/groups', getToken, post({ name }));

export const renameGroup = (getToken: TokenSource, groupId: string, name: string) =>
  requestJson<Group>(`/v1/groups/${groupId}`, getToken, { method: 'PATCH', body: JSON.stringify({ name }) });

/* -------------------------------------------------------------------------- */
/* Chat Sessions                                                               */
/* -------------------------------------------------------------------------- */

export const listChats = (getToken: TokenSource, groupId: string, cursor?: string | null) =>
  requestJson<Page<ThreadSummary>>(
    `/v1/groups/${groupId}/chats${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''}`,
    getToken,
  );

/**
 * A Chat Session is never created empty — the first message is what the
 * router reads to decide whether there is governed work to do.
 */
export const createChat = (getToken: TokenSource, groupId: string, message: string) =>
  requestJson<Thread>(`/v1/groups/${groupId}/chats`, getToken, post({ message }));

export const getChat = (getToken: TokenSource, threadId: string) =>
  requestJson<Thread>(`/v1/chats/${threadId}`, getToken);

export interface WorkflowExecutionTrace {
  execution_id: string;
  workflow_id: string;
  workflow_name: string;
  workflow_version: number;
  status: 'running' | 'completed' | 'failed';
  nodes: string[];
  routes: string[];
  error: string | null;
  selection_mode: 'auto' | 'manual';
  selection_reason: string | null;
  selection_fallback: boolean;
}

export const getLatestWorkflowExecution = (getToken: TokenSource, threadId: string) =>
  requestJson<WorkflowExecutionTrace | null>(
    `/v1/chats/${threadId}/workflow-executions/latest`,
    getToken,
  );

export const renameChat = (getToken: TokenSource, threadId: string, title: string) =>
  requestJson<Thread>(`/v1/chats/${threadId}`, getToken, { method: 'PATCH', body: JSON.stringify({ title }) });

/** The same endpoint serves an initial clarification and a later follow-up. */
export const appendMessage = (getToken: TokenSource, threadId: string, message: string) =>
  requestJson<Thread>(`/v1/chats/${threadId}/messages`, getToken, post({ message }));

export const archiveChat = (getToken: TokenSource, threadId: string) =>
  requestJson<Thread>(`/v1/chats/${threadId}/archive`, getToken, post());

export const restoreChat = (getToken: TokenSource, threadId: string) =>
  requestJson<Thread>(`/v1/chats/${threadId}/restore`, getToken, post());

/** Draft Chat Sessions with no Analysis Run only. The server enforces it. */
export const deleteChat = (getToken: TokenSource, threadId: string) =>
  requestJson<void>(`/v1/chats/${threadId}`, getToken, { method: 'DELETE' });

/* -------------------------------------------------------------------------- */
/* Analysis Run controls                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Cancellation is cooperative: this returns as soon as the request is
 * recorded, not once the agents have stopped. The Thread snapshot is what says
 * whether they have.
 */
export const cancelAnalysisRun = (getToken: TokenSource, analysisRunId: string) =>
  requestJson<unknown>(`/v1/analysis-runs/${analysisRunId}/cancel`, getToken, post());

/** Creates an immutable linked retry — a new entry in `analysis_runs`. */
export const retryAnalysisRun = (getToken: TokenSource, analysisRunId: string) =>
  requestJson<unknown>(`/v1/analysis-runs/${analysisRunId}/retry`, getToken, post());

/* -------------------------------------------------------------------------- */
/* Visualization                                                               */
/* -------------------------------------------------------------------------- */

export const getAnalysisRunVisualization = (getToken: TokenSource, analysisRunId: string) =>
  requestJson<Visualization>(`/v1/analysis-runs/${analysisRunId}/visualization`, getToken);

/** Renders again without re-running any analysis. */
export const retryVisualization = (getToken: TokenSource, visualizationId: string) =>
  requestJson<Visualization>(`/v1/visualizations/${visualizationId}/retry`, getToken, post());

/**
 * Execute a stored safe action.
 *
 * No parameters are sent. The renderer generated the button, so anything it
 * generated alongside is untrusted; the server resolves `action_id` against
 * the mapping it stored itself and ignores the rest.
 */
export const executeVisualizationAction = (
  getToken: TokenSource,
  visualizationId: string,
  actionId: string,
) =>
  requestJson<VisualizationActionResult>(
    `/v1/visualizations/${visualizationId}/actions/${actionId}/execute`,
    getToken,
    post({ parameters: {} }),
  );

/* -------------------------------------------------------------------------- */
/* Evidence and roster                                                         */
/* -------------------------------------------------------------------------- */

/** Resolves to a citation, or to a tombstone if the evidence was erased. */
export const resolveCitation = (
  getToken: TokenSource,
  analysisRunId: string,
  citationId: string,
) =>
  requestJson<ResolvedCitation>(
    `/v1/analysis-runs/${analysisRunId}/citations/${citationId}`,
    getToken,
  );

export const decideApproval = (
  getToken: TokenSource,
  analysisRunId: string,
  approvalId: string,
  decision: 'approve' | 'reject',
  reason: string | null,
) =>
  requestJson<unknown>(
    `/v1/analysis-runs/${analysisRunId}/approvals/${approvalId}/decision`,
    getToken,
    post({ decision, reason }),
  );

export const listAgents = (getToken: TokenSource) =>
  requestJson<readonly Agent[]>('/v1/agents', getToken);
