/**
 * Facade exports
 * @module facade
 */

export {
  DatabaseFacade,
  DATABASE_TRANSACTION_MODE,
  DATABASE_TRANSACTION_TABLE,
  getDatabaseFacade,
  resetDatabaseFacade,
  hasDatabaseFacade,
} from './database-facade';

export type { DatabaseTransactionMode, DatabaseTransactionTable } from './database-facade';
