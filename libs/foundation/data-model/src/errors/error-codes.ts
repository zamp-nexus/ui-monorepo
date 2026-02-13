/**
 * Foundation Error Codes Registry
 *
 * Centralized error codes for all foundation libraries.
 * Each code uniquely identifies an error type for programmatic handling.
 *
 * @module errors/error-codes
 */

// =============================================================================
// Error Codes
// =============================================================================

/**
 * Foundation library error codes
 *
 * Organized by domain:
 * - BRIDGE_* : DuckDB bridge errors
 * - QUERY_* : Query execution errors
 * - SYNC_* : Sync engine errors
 * - DATABASE_* : Database/storage errors
 * - NETWORK_* : Network-related errors
 * - VALIDATION_* : Data validation errors
 * - CONFIG_* : Configuration errors
 */
export const FoundationErrorCode = {
  // ===========================================================================
  // Bridge Errors (DuckDB Bridge Layer)
  // ===========================================================================

  /** Query execution timed out */
  BRIDGE_QUERY_TIMEOUT: 'BRIDGE_QUERY_TIMEOUT',
  /** Query was cancelled by user or system */
  BRIDGE_QUERY_CANCELLED: 'BRIDGE_QUERY_CANCELLED',
  /** Bridge not initialized before use */
  BRIDGE_NOT_INITIALIZED: 'BRIDGE_NOT_INITIALIZED',
  /** Bridge already initialized */
  BRIDGE_ALREADY_INITIALIZED: 'BRIDGE_ALREADY_INITIALIZED',
  /** Bridge initialization failed */
  BRIDGE_INIT_FAILED: 'BRIDGE_INIT_FAILED',
  /** Bridge shutdown failed */
  BRIDGE_SHUTDOWN_FAILED: 'BRIDGE_SHUTDOWN_FAILED',
  /** Worker pool exhausted */
  BRIDGE_WORKER_POOL_EXHAUSTED: 'BRIDGE_WORKER_POOL_EXHAUSTED',
  /** Worker crashed or became unresponsive */
  BRIDGE_WORKER_ERROR: 'BRIDGE_WORKER_ERROR',
  /** File registration failed */
  BRIDGE_FILE_REGISTRATION_FAILED: 'BRIDGE_FILE_REGISTRATION_FAILED',
  /** View creation failed */
  BRIDGE_VIEW_CREATION_FAILED: 'BRIDGE_VIEW_CREATION_FAILED',
  /** Transaction error */
  BRIDGE_TRANSACTION_ERROR: 'BRIDGE_TRANSACTION_ERROR',
  /** Parquet export/import failed */
  BRIDGE_PARQUET_ERROR: 'BRIDGE_PARQUET_ERROR',
  /** WASM module loading failed */
  BRIDGE_WASM_LOAD_FAILED: 'BRIDGE_WASM_LOAD_FAILED',
  /** Native bridge IPC error */
  BRIDGE_IPC_ERROR: 'BRIDGE_IPC_ERROR',
  /** Worker initialization failed */
  BRIDGE_WORKER_INIT_FAILED: 'BRIDGE_WORKER_INIT_FAILED',
  /** Pool shutdown in progress */
  BRIDGE_POOL_SHUTDOWN: 'BRIDGE_POOL_SHUTDOWN',
  /** Pool at capacity */
  BRIDGE_POOL_AT_CAPACITY: 'BRIDGE_POOL_AT_CAPACITY',
  /** OPFS file not found */
  BRIDGE_OPFS_NOT_FOUND: 'BRIDGE_OPFS_NOT_FOUND',
  /** OPFS permission denied */
  BRIDGE_OPFS_PERMISSION_DENIED: 'BRIDGE_OPFS_PERMISSION_DENIED',
  /** OPFS write failed */
  BRIDGE_OPFS_WRITE_FAILED: 'BRIDGE_OPFS_WRITE_FAILED',
  /** SQL validation failed */
  BRIDGE_SQL_VALIDATION_FAILED: 'BRIDGE_SQL_VALIDATION_FAILED',

  // ===========================================================================
  // Query Errors
  // ===========================================================================

  /** SQL syntax error */
  QUERY_SYNTAX_ERROR: 'QUERY_SYNTAX_ERROR',
  /** Query execution failed */
  QUERY_EXECUTION_FAILED: 'QUERY_EXECUTION_FAILED',
  /** Table not found */
  QUERY_TABLE_NOT_FOUND: 'QUERY_TABLE_NOT_FOUND',
  /** Column not found */
  QUERY_COLUMN_NOT_FOUND: 'QUERY_COLUMN_NOT_FOUND',
  /** Invalid query parameters */
  QUERY_INVALID_PARAMS: 'QUERY_INVALID_PARAMS',
  /** Query result conversion failed */
  QUERY_RESULT_CONVERSION_FAILED: 'QUERY_RESULT_CONVERSION_FAILED',
  /** Query schema mismatch */
  QUERY_SCHEMA_MISMATCH: 'QUERY_SCHEMA_MISMATCH',

  // ===========================================================================
  // Sync Engine Errors
  // ===========================================================================

  /** Sync operation failed */
  SYNC_FAILED: 'SYNC_FAILED',
  /** Conflict detected during sync */
  SYNC_CONFLICT: 'SYNC_CONFLICT',
  /** Mutation queue processing failed */
  SYNC_QUEUE_PROCESSING_FAILED: 'SYNC_QUEUE_PROCESSING_FAILED',
  /** Cross-tab sync error */
  SYNC_CROSS_TAB_ERROR: 'SYNC_CROSS_TAB_ERROR',
  /** Leader election failed */
  SYNC_LEADER_ELECTION_FAILED: 'SYNC_LEADER_ELECTION_FAILED',
  /** Mutation not found in queue */
  SYNC_MUTATION_NOT_FOUND: 'SYNC_MUTATION_NOT_FOUND',
  /** Invalid mutation format */
  SYNC_INVALID_MUTATION: 'SYNC_INVALID_MUTATION',
  /** Convex adapter error */
  SYNC_CONVEX_ERROR: 'SYNC_CONVEX_ERROR',
  /** Network monitor error */
  SYNC_NETWORK_MONITOR_ERROR: 'SYNC_NETWORK_MONITOR_ERROR',
  /** Offline queue is full */
  SYNC_OFFLINE_QUEUE_FULL: 'SYNC_OFFLINE_QUEUE_FULL',
  /** ID mapping operation failed */
  SYNC_ID_MAPPING_FAILED: 'SYNC_ID_MAPPING_FAILED',
  /** Rehydration from storage failed */
  SYNC_REHYDRATION_FAILED: 'SYNC_REHYDRATION_FAILED',

  // ===========================================================================
  // Database/Storage Errors
  // ===========================================================================

  /** Database connection failed */
  DATABASE_CONNECTION_FAILED: 'DATABASE_CONNECTION_FAILED',
  /** Database operation failed */
  DATABASE_OPERATION_FAILED: 'DATABASE_OPERATION_FAILED',
  /** Database not initialized */
  DATABASE_NOT_INITIALIZED: 'DATABASE_NOT_INITIALIZED',
  /** OPFS not supported */
  DATABASE_OPFS_NOT_SUPPORTED: 'DATABASE_OPFS_NOT_SUPPORTED',
  /** OPFS initialization failed */
  DATABASE_OPFS_INIT_FAILED: 'DATABASE_OPFS_INIT_FAILED',
  /** OPFS file operation failed */
  DATABASE_OPFS_ERROR: 'DATABASE_OPFS_ERROR',
  /** IndexedDB operation failed */
  DATABASE_INDEXEDDB_ERROR: 'DATABASE_INDEXEDDB_ERROR',
  /** Storage quota exceeded */
  DATABASE_QUOTA_EXCEEDED: 'DATABASE_QUOTA_EXCEEDED',
  /** Duplicate entry */
  DATABASE_DUPLICATE_ENTRY: 'DATABASE_DUPLICATE_ENTRY',

  // ===========================================================================
  // Network Errors
  // ===========================================================================

  /** Network request failed */
  NETWORK_REQUEST_FAILED: 'NETWORK_REQUEST_FAILED',
  /** Network request was explicitly cancelled (e.g. AbortController) */
  NETWORK_REQUEST_CANCELLED: 'NETWORK_REQUEST_CANCELLED',
  /** Network timeout */
  NETWORK_TIMEOUT: 'NETWORK_TIMEOUT',
  /** Network offline */
  NETWORK_OFFLINE: 'NETWORK_OFFLINE',
  /** Health check failed */
  NETWORK_HEALTH_CHECK_FAILED: 'NETWORK_HEALTH_CHECK_FAILED',

  // ===========================================================================
  // Validation Errors
  // ===========================================================================

  /** Generic validation error */
  VALIDATION_FAILED: 'VALIDATION_FAILED',
  /** Required field missing */
  VALIDATION_REQUIRED: 'VALIDATION_REQUIRED',
  /** Invalid type */
  VALIDATION_TYPE: 'VALIDATION_TYPE',
  /** Value out of range */
  VALIDATION_RANGE: 'VALIDATION_RANGE',
  /** Invalid format */
  VALIDATION_FORMAT: 'VALIDATION_FORMAT',
  /** Schema validation failed */
  VALIDATION_SCHEMA: 'VALIDATION_SCHEMA',

  // ===========================================================================
  // Configuration Errors
  // ===========================================================================

  /** Invalid configuration */
  CONFIG_INVALID: 'CONFIG_INVALID',
  /** Missing required configuration */
  CONFIG_MISSING: 'CONFIG_MISSING',
  /** Configuration conflict */
  CONFIG_CONFLICT: 'CONFIG_CONFLICT',

  // ===========================================================================
  // Resource Errors
  // ===========================================================================

  /** Resource disposed */
  RESOURCE_DISPOSED: 'RESOURCE_DISPOSED',
  /** Resource not found */
  RESOURCE_NOT_FOUND: 'RESOURCE_NOT_FOUND',
  /** Resource locked */
  RESOURCE_LOCKED: 'RESOURCE_LOCKED',
  /** Resource busy */
  RESOURCE_BUSY: 'RESOURCE_BUSY',

  // ===========================================================================
  // Internal Errors
  // ===========================================================================

  /** Unknown/internal error */
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  /** Assertion failed */
  ASSERTION_FAILED: 'ASSERTION_FAILED',
  /** Not implemented */
  NOT_IMPLEMENTED: 'NOT_IMPLEMENTED',
} as const;

export type FoundationErrorCode = (typeof FoundationErrorCode)[keyof typeof FoundationErrorCode];

// =============================================================================
// Error Categories
// =============================================================================

/**
 * Categories for grouping error types
 */
export const ErrorCategory = {
  /** Transient errors that may resolve on retry */
  TRANSIENT: 'transient',
  /** Permanent errors that will not resolve on retry */
  PERMANENT: 'permanent',
  /** Errors caused by invalid user input */
  USER_INPUT: 'user_input',
  /** Infrastructure/system errors */
  INFRASTRUCTURE: 'infrastructure',
  /** Configuration errors */
  CONFIGURATION: 'configuration',
  /** Unknown/internal errors */
  UNKNOWN: 'unknown',
} as const;

export type ErrorCategory = (typeof ErrorCategory)[keyof typeof ErrorCategory];

// =============================================================================
// Error Code to Category Mapping
// =============================================================================

/**
 * Get the category for an error code
 *
 * @param code - Foundation error code
 * @returns The error category
 */
export function getErrorCategory(code: FoundationErrorCode): ErrorCategory {
  switch (code) {
    // Transient errors (may resolve on retry)
    case FoundationErrorCode.BRIDGE_QUERY_TIMEOUT:
    case FoundationErrorCode.BRIDGE_WORKER_POOL_EXHAUSTED:
    case FoundationErrorCode.BRIDGE_WORKER_ERROR:
    case FoundationErrorCode.BRIDGE_WORKER_INIT_FAILED:
    case FoundationErrorCode.BRIDGE_POOL_AT_CAPACITY:
    case FoundationErrorCode.NETWORK_REQUEST_FAILED:
    case FoundationErrorCode.NETWORK_TIMEOUT:
    case FoundationErrorCode.NETWORK_OFFLINE:
    case FoundationErrorCode.NETWORK_HEALTH_CHECK_FAILED:
    case FoundationErrorCode.SYNC_FAILED:
    case FoundationErrorCode.SYNC_QUEUE_PROCESSING_FAILED:
    case FoundationErrorCode.SYNC_CROSS_TAB_ERROR:
    case FoundationErrorCode.SYNC_NETWORK_MONITOR_ERROR:
    case FoundationErrorCode.SYNC_REHYDRATION_FAILED:
    case FoundationErrorCode.DATABASE_CONNECTION_FAILED:
    case FoundationErrorCode.RESOURCE_BUSY:
    case FoundationErrorCode.RESOURCE_LOCKED:
      return ErrorCategory.TRANSIENT;

    // User input errors
    case FoundationErrorCode.VALIDATION_FAILED:
    case FoundationErrorCode.VALIDATION_REQUIRED:
    case FoundationErrorCode.VALIDATION_TYPE:
    case FoundationErrorCode.VALIDATION_RANGE:
    case FoundationErrorCode.VALIDATION_FORMAT:
    case FoundationErrorCode.VALIDATION_SCHEMA:
    case FoundationErrorCode.QUERY_SYNTAX_ERROR:
    case FoundationErrorCode.QUERY_INVALID_PARAMS:
    case FoundationErrorCode.SYNC_INVALID_MUTATION:
    case FoundationErrorCode.BRIDGE_SQL_VALIDATION_FAILED:
      return ErrorCategory.USER_INPUT;

    // Configuration errors
    case FoundationErrorCode.CONFIG_INVALID:
    case FoundationErrorCode.CONFIG_MISSING:
    case FoundationErrorCode.CONFIG_CONFLICT:
    case FoundationErrorCode.BRIDGE_NOT_INITIALIZED:
    case FoundationErrorCode.BRIDGE_ALREADY_INITIALIZED:
    case FoundationErrorCode.DATABASE_NOT_INITIALIZED:
      return ErrorCategory.CONFIGURATION;

    // Infrastructure errors
    case FoundationErrorCode.BRIDGE_INIT_FAILED:
    case FoundationErrorCode.BRIDGE_SHUTDOWN_FAILED:
    case FoundationErrorCode.BRIDGE_WASM_LOAD_FAILED:
    case FoundationErrorCode.BRIDGE_IPC_ERROR:
    case FoundationErrorCode.BRIDGE_OPFS_NOT_FOUND:
    case FoundationErrorCode.BRIDGE_OPFS_PERMISSION_DENIED:
    case FoundationErrorCode.BRIDGE_OPFS_WRITE_FAILED:
    case FoundationErrorCode.DATABASE_OPFS_NOT_SUPPORTED:
    case FoundationErrorCode.DATABASE_OPFS_INIT_FAILED:
    case FoundationErrorCode.DATABASE_OPFS_ERROR:
    case FoundationErrorCode.DATABASE_INDEXEDDB_ERROR:
    case FoundationErrorCode.DATABASE_QUOTA_EXCEEDED:
    case FoundationErrorCode.DATABASE_OPERATION_FAILED:
    case FoundationErrorCode.DATABASE_DUPLICATE_ENTRY:
      return ErrorCategory.INFRASTRUCTURE;

    // Permanent/unrecoverable errors
    case FoundationErrorCode.BRIDGE_QUERY_CANCELLED:
    case FoundationErrorCode.NETWORK_REQUEST_CANCELLED:
    case FoundationErrorCode.BRIDGE_POOL_SHUTDOWN:
    case FoundationErrorCode.QUERY_TABLE_NOT_FOUND:
    case FoundationErrorCode.QUERY_COLUMN_NOT_FOUND:
    case FoundationErrorCode.SYNC_MUTATION_NOT_FOUND:
    case FoundationErrorCode.SYNC_OFFLINE_QUEUE_FULL:
    case FoundationErrorCode.SYNC_ID_MAPPING_FAILED:
    case FoundationErrorCode.RESOURCE_DISPOSED:
    case FoundationErrorCode.RESOURCE_NOT_FOUND:
    case FoundationErrorCode.NOT_IMPLEMENTED:
      return ErrorCategory.PERMANENT;

    // Unknown/internal
    default:
      return ErrorCategory.UNKNOWN;
  }
}

/**
 * Check if an error code is retryable
 *
 * @param code - Foundation error code
 * @returns True if the error may resolve on retry
 */
export function isRetryableErrorCode(code: FoundationErrorCode): boolean {
  return getErrorCategory(code) === ErrorCategory.TRANSIENT;
}
