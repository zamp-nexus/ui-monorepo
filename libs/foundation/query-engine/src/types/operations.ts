/**
 * Query Operations
 *
 * Defines the supported CRUDL operations for the query engine.
 *
 * @module types/operations
 */

// =============================================================================
// QUERY OPERATIONS (CRUDL)
// =============================================================================

/**
 * Supported query operations.
 *
 * - `get`: Retrieve a single entity by ID
 * - `list`: Retrieve multiple entities with optional filters
 * - `create`: Create a new entity
 * - `update`: Update an existing entity
 * - `delete`: Delete an existing entity
 */
export const OPERATIONS = {
  GET: 'get',
  LIST: 'list',
  CREATE: 'create',
  UPDATE: 'update',
  DELETE: 'delete',
} as const;

/**
 * Type derived from OPERATIONS const object.
 */
export type Operation = (typeof OPERATIONS)[keyof typeof OPERATIONS];

/**
 * Read operations (get, list).
 */
export const READ_OPERATIONS = {
  GET: OPERATIONS.GET,
  LIST: OPERATIONS.LIST,
} as const;

export type ReadOperation = (typeof READ_OPERATIONS)[keyof typeof READ_OPERATIONS];

/**
 * Write operations (create, update, delete).
 */
export const WRITE_OPERATIONS = {
  CREATE: OPERATIONS.CREATE,
  UPDATE: OPERATIONS.UPDATE,
  DELETE: OPERATIONS.DELETE,
} as const;

export type WriteOperation = (typeof WRITE_OPERATIONS)[keyof typeof WRITE_OPERATIONS];

// =============================================================================
// TYPE GUARDS
// =============================================================================

/**
 * Check if operation is a valid operation.
 */
export const isOperation = (value: unknown): value is Operation => {
  return (
    typeof value === 'string' &&
    Object.values(OPERATIONS).includes(value as Operation)
  );
};

/**
 * Check if operation is a read operation (get or list).
 */
export const isReadOperation = (value: unknown): value is ReadOperation => {
  return (
    typeof value === 'string' &&
    Object.values(READ_OPERATIONS).includes(value as ReadOperation)
  );
};

/**
 * Check if operation is a write operation (create, update, delete).
 */
export const isWriteOperation = (value: unknown): value is WriteOperation => {
  return (
    typeof value === 'string' &&
    Object.values(WRITE_OPERATIONS).includes(value as WriteOperation)
  );
};

/**
 * Check if operation is a mutation (same as write operation).
 */
export const isMutationOperation = isWriteOperation;
