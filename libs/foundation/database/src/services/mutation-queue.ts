/**
 * Mutation Queue Service
 *
 * Service for managing the mutation queue in the database.
 * Implements MutationQueueOperations interface with fixed idempotency.
 *
 * @module services/mutation-queue
 */

import { BaseService } from './base';
import type {
  MutationQueueOperations,
  MutationQueueEntry,
  CreateMutationOptions,
} from '../tables';
import { MutationStatus } from '../core/config';
import { generateIdempotencyKey as generateIdempotencyKeyUtil } from '../utils/hash';
import { mutationQueueEntrySchema } from '../validation/schemas';
import { createValidationError, createDuplicateEntryError } from '../errors';

/**
 * Extended CreateMutationOptions with optional idempotency key
 */
export interface ExtendedCreateMutationOptions extends CreateMutationOptions {
  /** Custom idempotency key (if not provided, will be generated from payload) */
  idempotencyKey?: string;
}

/**
 * Mutation Queue Service
 * Implements MutationQueueOperations with fixed idempotency key generation
 */
export class MutationQueueService extends BaseService implements MutationQueueOperations {
  /**
   * Generate idempotency key for a mutation
   * Uses the shared utility from utils/hash.ts
   */
  generateIdempotencyKey = (options: ExtendedCreateMutationOptions): string => {
    return generateIdempotencyKeyUtil({
      tableName: options.tableName,
      entityId: options.entityId,
      payload: options.payload,
      customKey: options.idempotencyKey,
    });
  };

  /**
   * Add a mutation to the queue
   * Checks for duplicate idempotency keys
   * Uses transaction to prevent race conditions (TOCTOU)
   */
  add = async (entry: MutationQueueEntry): Promise<void> => {
    // Validate entry before transaction
    const validation = mutationQueueEntrySchema.safeParse(entry);
    if (!validation.success) {
      throw createValidationError('MutationQueueEntry', validation.error.message);
    }

    await this.db.transaction('rw', this.db.mutations, async () => {
      // Check for duplicate idempotency key within transaction
      const existing = await this.db.mutations
        .where('idempotencyKey')
        .equals(entry.idempotencyKey)
        .first();

      if (existing) {
        this.log('Duplicate mutation ignored:', entry.idempotencyKey);
        throw createDuplicateEntryError(entry.idempotencyKey, 'mutation');
      }

      await this.db.mutations.add(entry);
      this.log('Mutation added:', entry.id);
    });
  };

  /**
   * Add a mutation, silently ignoring duplicates
   * Uses transaction to prevent race conditions (TOCTOU)
   */
  addIfNotExists = async (entry: MutationQueueEntry): Promise<boolean> => {
    // Validate entry before transaction
    const validation = mutationQueueEntrySchema.safeParse(entry);
    if (!validation.success) {
      throw createValidationError('MutationQueueEntry', validation.error.message);
    }

    return this.db.transaction('rw', this.db.mutations, async () => {
      // Check for duplicate idempotency key within transaction
      const existing = await this.db.mutations
        .where('idempotencyKey')
        .equals(entry.idempotencyKey)
        .first();

      if (existing) {
        this.log('Duplicate mutation ignored:', entry.idempotencyKey);
        return false;
      }

      await this.db.mutations.add(entry);
      this.log('Mutation added:', entry.id);
      return true;
    });
  };

  /**
   * Get mutation by ID
   */
  get = async (id: string): Promise<MutationQueueEntry | undefined> => {
    return this.db.mutations.get(id);
  };

  /**
   * Update mutation status
   */
  updateStatus = async (
    id: string,
    status: MutationStatus,
    updates?: Partial<MutationQueueEntry>
  ): Promise<void> => {
    await this.db.mutations.update(id, { status, ...updates });
    this.log('Mutation status updated:', id, status);
  };

  /**
   * Get all pending mutations in order
   */
  getPending = async (): Promise<MutationQueueEntry[]> => {
    return this.db.mutations
      .where('status')
      .anyOf([MutationStatus.PENDING, MutationStatus.OFFLINE_QUEUED])
      .sortBy('timestamp');
  };

  /**
   * Get mutations by status
   */
  getByStatus = async (status: MutationStatus): Promise<MutationQueueEntry[]> => {
    return this.db.mutations.where('status').equals(status).toArray();
  };

  /**
   * Delete completed mutations
   */
  deleteCompleted = async (): Promise<number> => {
    const count = await this.db.mutations
      .where('status')
      .equals(MutationStatus.COMPLETED)
      .delete();
    if (count > 0) {
      this.log(`Deleted ${count} completed mutations`);
    }
    return count;
  };

  /**
   * Delete mutation by ID
   */
  delete = async (id: string): Promise<void> => {
    await this.db.mutations.delete(id);
    this.log('Mutation deleted:', id);
  };

  /**
   * Count mutations by status
   */
  countByStatus = async (status: MutationStatus): Promise<number> => {
    return this.db.mutations.where('status').equals(status).count();
  };

  /**
   * Mark all pending mutations as offline queued
   */
  markAllOfflineQueued = async (): Promise<number> => {
    const count = await this.db.mutations
      .where('status')
      .equals(MutationStatus.PENDING)
      .modify({ status: MutationStatus.OFFLINE_QUEUED });
    this.log(`Marked ${count} mutations as offline queued`);
    return count;
  };

  /**
   * Find mutation by idempotency key
   */
  findByIdempotencyKey = async (
    key: string
  ): Promise<MutationQueueEntry | undefined> => {
    return this.db.mutations.where('idempotencyKey').equals(key).first();
  };

  /**
   * Get total count of mutations
   */
  count = async (): Promise<number> => {
    return this.db.mutations.count();
  };

  /**
   * Clear all mutations
   */
  clear = async (): Promise<void> => {
    await this.db.mutations.clear();
    this.log('Mutation queue cleared');
  };

  // =========================================================================
  // Bulk Operations
  // =========================================================================

  /**
   * Get multiple mutations by IDs in a single operation
   *
   * Returns entries in the same order as the input IDs.
   * Missing entries are represented as undefined in the result array.
   *
   * @param ids - Array of mutation IDs to retrieve
   * @returns Array of mutation entries (undefined for missing entries)
   */
  bulkGet = async (ids: string[]): Promise<(MutationQueueEntry | undefined)[]> => {
    if (ids.length === 0) return [];

    const entries = await this.db.mutations.bulkGet(ids);
    this.log(`Bulk get ${ids.length} mutations, found ${entries.filter(Boolean).length}`);
    return entries;
  };

  /**
   * Add multiple mutations in a single operation
   * Validates all entries before adding
   */
  bulkAdd = async (entries: MutationQueueEntry[]): Promise<void> => {
    if (entries.length === 0) return;

    // Validate all entries first
    for (const entry of entries) {
      const validation = mutationQueueEntrySchema.safeParse(entry);
      if (!validation.success) {
        throw createValidationError('MutationQueueEntry', validation.error.message);
      }
    }

    await this.db.mutations.bulkAdd(entries);
    this.log(`Bulk added ${entries.length} mutations`);
  };

  /**
   * Delete multiple mutations by IDs
   */
  bulkDelete = async (ids: string[]): Promise<number> => {
    if (ids.length === 0) return 0;

    await this.db.mutations.bulkDelete(ids);
    this.log(`Bulk deleted ${ids.length} mutations`);
    return ids.length;
  };
}
