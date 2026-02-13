/**
 * Database Registry
 *
 * Internal registry to coordinate database instance management between
 * InsightsDatabase singleton and DatabaseFacade singleton.
 *
 * This prevents the two singletons from getting out of sync.
 *
 * @module core/database-registry
 * @internal
 */

import type { InsightsDatabase } from './database';

/**
 * Callback type for reset notifications
 */
type ResetCallback = () => void;

/**
 * Internal registry state
 */
interface RegistryState {
  /** The current database instance (if any) */
  database: InsightsDatabase | null;
  /** Callbacks to notify on database reset */
  resetCallbacks: Set<ResetCallback>;
}

const state: RegistryState = {
  database: null,
  resetCallbacks: new Set(),
};

/**
 * Set the active database instance
 */
export const setDatabaseInstance = (db: InsightsDatabase | null): void => {
  state.database = db;
};

/**
 * Get the active database instance
 */
export const getDatabaseInstance = (): InsightsDatabase | null => {
  return state.database;
};

/**
 * Register a callback to be notified when the database is reset
 */
export const onDatabaseReset = (callback: ResetCallback): (() => void) => {
  state.resetCallbacks.add(callback);
  return () => {
    state.resetCallbacks.delete(callback);
  };
};

/**
 * Notify all registered callbacks that the database is being reset
 */
export const notifyDatabaseReset = (): void => {
  for (const callback of state.resetCallbacks) {
    try {
      callback();
    } catch (error) {
      // Log errors from callbacks instead of silently ignoring
      console.warn('[DatabaseRegistry] Reset callback error:', error);
    }
  }
};

/**
 * Clear all state (for testing)
 */
export const clearRegistry = (): void => {
  state.database = null;
  state.resetCallbacks.clear();
};
