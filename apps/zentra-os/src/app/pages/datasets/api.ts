import { requestJson, type TokenSource } from '../../api';

import type { CatalogResponse, HarvestResponse } from './types';

/**
 * The latest catalog for a source.
 *
 * 404 until a harvest has completed, which is a meaningful answer rather than
 * an error: it is how the page tells "nothing discovered yet" from "discovery
 * failed", and the two want different things offered to the reader.
 */
export const latestCatalog = (getToken: TokenSource, dataSourceId: string) =>
  requestJson<CatalogResponse>(
    `/v1/connector/sources/${dataSourceId}/catalog`,
    getToken,
  );

/**
 * Begin discovery. Answers 202 with something to watch.
 *
 * The work is scheduled after the response rather than awaited — relation
 * inference issues a query per candidate pair against someone else's warehouse
 * and will not finish inside a request.
 */
export const startHarvest = (getToken: TokenSource, dataSourceId: string) =>
  requestJson<HarvestResponse>(
    `/v1/connector/sources/${dataSourceId}/harvests`,
    getToken,
    { method: 'POST', body: JSON.stringify({}) },
  );

export const getHarvest = (getToken: TokenSource, harvestRunId: string) =>
  requestJson<HarvestResponse>(`/v1/connector/harvests/${harvestRunId}`, getToken);

/** The most recent runs for a source, newest first. */
export const listHarvests = (getToken: TokenSource, dataSourceId: string) =>
  requestJson<HarvestResponse[]>(
    `/v1/connector/sources/${dataSourceId}/harvests`,
    getToken,
  );
