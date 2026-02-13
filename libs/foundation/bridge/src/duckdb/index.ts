/**
 * DuckDB exports
 *
 * For bridge types, import directly from '../types/bridge'.
 * For branded types, import from '@open-insights-web/foundation-data-model'.
 *
 * @module duckdb
 */

export {
  DuckDBRouter,
  createDuckDBRouter,
  getDuckDBRouter,
  resetDuckDBRouter,
  type DuckDBRouterConfig,
} from './router';

export {
  convertArrowValue,
  convertArrowRow,
  convertArrowTableToJSON,
  getColumnMetadata,
} from './arrow-converter';

// Backward compatibility types
export type { DuckDBRow, DuckDBResult } from './types';
