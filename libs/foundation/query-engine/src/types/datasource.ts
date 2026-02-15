/**
 * Query-engine datasource contracts re-exported from foundation-data-model.
 *
 * @module types/datasource
 */

export type {
  DataSourceFileInfo,
  DataSourceTableInfo,
  DataSourceMetadata,
  DataSourceResponse,
  DataSourceRequest,
} from '@open-insights-web/foundation-data-model';

export {
  isDataSourceFileInfo,
  isDataSourceTableInfo,
  isDataSourceResponse,
  calculateTableSize,
  calculateTotalRows,
  calculateTotalSize,
  getTablesNeedingUpdate,
  hasExpiredUrls,
} from '@open-insights-web/foundation-data-model';
