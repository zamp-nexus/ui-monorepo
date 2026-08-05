import { requestJson, type TokenSource } from '../../api';

export interface WorkflowNodeData extends Record<string, unknown> {
  label: string;
  role?: string;
  responsibility?: string;
  skills?: string[];
  tools?: string[];
  controller?: boolean;
}

export interface WorkflowDocument {
  nodes: Array<{ id: string; type: 'trigger' | 'agent' | 'result'; position: { x: number; y: number }; data: WorkflowNodeData }>;
  edges: Array<{ id: string; source: string; target: string; data?: { route?: string; is_loop?: boolean; max_iterations?: number } }>;
}

export interface WorkflowSummary {
  workflow_id: string;
  name: string;
  is_system: boolean;
  published_version: number | null;
  updated_at: string | null;
}

export interface WorkflowDetail extends WorkflowSummary {
  definition: WorkflowDocument;
  versions: number[];
}

export const listWorkflows = (getToken: TokenSource) => requestJson<WorkflowSummary[]>('/v1/workflows', getToken);
export const getWorkflow = (getToken: TokenSource, id: string) => requestJson<WorkflowDetail>(`/v1/workflows/${id}`, getToken);
export const cloneDefaultWorkflow = (getToken: TokenSource, name: string) => requestJson<WorkflowDetail>('/v1/workflows/clone-default', getToken, { method: 'POST', body: JSON.stringify({ name }) });
export const saveWorkflow = (getToken: TokenSource, id: string, name: string, definition: WorkflowDocument) => requestJson<WorkflowDetail>(`/v1/workflows/${id}`, getToken, { method: 'PUT', body: JSON.stringify({ name, definition }) });
export const publishWorkflow = (getToken: TokenSource, id: string) => requestJson<WorkflowDetail>(`/v1/workflows/${id}/publish`, getToken, { method: 'POST' });
