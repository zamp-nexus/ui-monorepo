import { requestJson, type TokenSource } from '../../api';
import type {
  CreateSequenceRequest,
  PreparedTablePreview,
  SequenceGraph,
  SequenceListResponse,
} from './types';

export const listSequences = (getToken: TokenSource) =>
  requestJson<SequenceListResponse>('/v1/sequences', getToken);

export const getSequence = (getToken: TokenSource, sequenceId: string) =>
  requestJson<SequenceGraph>(`/v1/sequences/${sequenceId}`, getToken);

export const getPreparedTablePreview = (
  getToken: TokenSource,
  sequenceId: string,
  preparedTableId: string,
) =>
  requestJson<PreparedTablePreview>(
    `/v1/sequences/${sequenceId}/prepared-tables/${preparedTableId}`,
    getToken,
  );

export const createSequence = (getToken: TokenSource, body: CreateSequenceRequest) =>
  requestJson<SequenceGraph>('/v1/sequences', getToken, {
    method: 'POST',
    body: JSON.stringify(body),
  });
