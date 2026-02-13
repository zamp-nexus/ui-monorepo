/**
 * Mutation queue table definitions and operations
 * @module tables/mutation-queue
 */

import { ConflictStrategy, type JsonValue } from '@open-insights-web/foundation-data-model';
import { MutationStatus } from '../core/config';
import { generateIdempotencyKey } from '../utils/hash';

/**
 * Mutation type constants for CRUD operations
 */
export const MutationType = {
  CREATE: 'create',
  UPDATE: 'update',
  DELETE: 'delete',
} as const;

export type MutationType = (typeof MutationType)[keyof typeof MutationType];

/**
 * Mutation queue entry stored in Dexie
 * @template TPayload - Type of the mutation payload (defaults to JsonValue)
 */
export interface MutationQueueEntry<TPayload = JsonValue> {
  /** Unique mutation ID */
  id: string;
  /** Idempotency key to prevent duplicate processing */
  idempotencyKey: string;
  /** Timestamp when mutation was created */
  timestamp: number;
  /** Current status */
  status: MutationStatus;
  /** Type of mutation */
  type: MutationType;
  /** Target table/entity name */
  tableName: string;
  /** Entity ID (may be provisional for offline creates) */
  entityId: string;
  /** Mutation payload */
  payload: TPayload;
  /** Optimistic data applied to cache */
  optimisticData?: TPayload;
  /** Previous data for rollback */
  previousData?: TPayload;
  /** Number of retry attempts */
  retryCount: number;
  /** Last error message if failed */
  lastError?: string;
  /** Server-assigned ID after successful sync */
  serverId?: string;
  /** Related query keys to invalidate on success */
  invalidateKeys?: string[];
  /** Dependencies on other mutations (must complete first) */
  dependsOn?: string[];
  /** Conflict resolution strategy */
  conflictStrategy?: ConflictStrategy;
}

/**
 * Create mutation entry options
 * @template TPayload - Type of the mutation payload (defaults to JsonValue)
 */
export interface CreateMutationOptions<TPayload = JsonValue> {
  type: MutationType;
  tableName: string;
  entityId: string;
  payload: TPayload;
  optimisticData?: TPayload;
  previousData?: TPayload;
  invalidateKeys?: string[];
  dependsOn?: string[];
  conflictStrategy?: ConflictStrategy;
}

/**
 * Create a new mutation queue entry
 * @template TPayload - Type of the mutation payload
 */
export const createMutationEntry = <TPayload = JsonValue>(
  id: string,
  options: CreateMutationOptions<TPayload>
): MutationQueueEntry<TPayload> => {
  // Generate idempotency key using shared utility
  // Includes type in payload hash to differentiate create vs update on same entity
  const idempotencyKey = generateIdempotencyKey({
    tableName: options.tableName,
    entityId: options.entityId,
    payload: {
      type: options.type,
      tableName: options.tableName,
      entityId: options.entityId,
      payload: options.payload,
    },
  });

  return {
    id,
    idempotencyKey,
    timestamp: Date.now(),
    status: MutationStatus.PENDING,
    type: options.type,
    tableName: options.tableName,
    entityId: options.entityId,
    payload: options.payload,
    optimisticData: options.optimisticData,
    previousData: options.previousData,
    retryCount: 0,
    invalidateKeys: options.invalidateKeys,
    dependsOn: options.dependsOn,
    conflictStrategy: options.conflictStrategy ?? ConflictStrategy.LAST_WRITE_WINS,
  };
};

/**
 * Check if mutation can be processed (no pending dependencies)
 */
export const canProcessMutation = <TPayload = JsonValue>(
  mutation: MutationQueueEntry<TPayload>,
  completedIds: Set<string>
): boolean => {
  if (!mutation.dependsOn || mutation.dependsOn.length === 0) {
    return true;
  }
  return mutation.dependsOn.every((depId) => completedIds.has(depId));
};

/**
 * Check if mutation should be retried
 */
export const shouldRetry = <TPayload = JsonValue>(
  mutation: MutationQueueEntry<TPayload>,
  maxRetries: number
): boolean => {
  return (
    mutation.status === MutationStatus.FAILED &&
    mutation.retryCount < maxRetries
  );
};

/**
 * Update mutation for retry
 */
export const prepareForRetry = <TPayload = JsonValue>(
  mutation: MutationQueueEntry<TPayload>,
  error?: string
): MutationQueueEntry<TPayload> => {
  return {
    ...mutation,
    status: MutationStatus.PENDING,
    retryCount: mutation.retryCount + 1,
    lastError: error,
  };
};

/**
 * Mutation queue operations interface
 */
export interface MutationQueueOperations {
  /** Add a mutation to the queue */
  add(entry: MutationQueueEntry): Promise<void>;
  /** Add a mutation, silently ignoring duplicates. Returns true if added, false if duplicate. */
  addIfNotExists(entry: MutationQueueEntry): Promise<boolean>;
  /** Get mutation by ID */
  get(id: string): Promise<MutationQueueEntry | undefined>;
  /** Update mutation status */
  updateStatus(id: string, status: MutationStatus, updates?: Partial<MutationQueueEntry>): Promise<void>;
  /** Get all pending mutations in order */
  getPending(): Promise<MutationQueueEntry[]>;
  /** Get mutations by status */
  getByStatus(status: MutationStatus): Promise<MutationQueueEntry[]>;
  /** Delete completed mutations */
  deleteCompleted(): Promise<number>;
  /** Delete mutation by ID */
  delete(id: string): Promise<void>;
  /** Get count by status */
  countByStatus(status: MutationStatus): Promise<number>;
  /** Mark all pending as offline queued */
  markAllOfflineQueued(): Promise<number>;
  /** Find by idempotency key (for deduplication) */
  findByIdempotencyKey(key: string): Promise<MutationQueueEntry | undefined>;
  /** Get total count of mutations */
  count(): Promise<number>;
  /** Clear all mutations */
  clear(): Promise<void>;

  // Bulk operations
  /** Get multiple mutations by IDs in a single operation */
  bulkGet(ids: string[]): Promise<(MutationQueueEntry | undefined)[]>;
  /** Add multiple mutations in a single operation */
  bulkAdd(entries: MutationQueueEntry[]): Promise<void>;
  /** Delete multiple mutations by IDs */
  bulkDelete(ids: string[]): Promise<number>;
}
