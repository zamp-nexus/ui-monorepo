/**
 * Database Module Tests
 *
 * Unit tests for the database refactored components.
 * Uses const arrow functions, early returns, and descriptive naming.
 *
 * @module database.spec
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { hasErrorCode } from '@open-insights-web/foundation-data-model';
import {
  // Errors
  DatabaseError,
  createQuotaExceededError,
  createOpfsNotSupportedError,
  createValidationError,
  isDatabaseError,
  isQuotaExceededError,
} from './errors';
import {
  // Utils
  hashPayloadAsync,
  hashPayloadSync,
  generateIdempotencyKey,
} from './utils';
import {
  // Validation
  queryCacheEntrySchema,
  mutationQueueEntrySchema,
  createValidator,
  validateQueryCacheEntry,
} from './validation';

// =============================================================================
// Error Tests
// =============================================================================

describe('Database Errors', () => {
  describe('DatabaseError', () => {
    it('should create error with code and message', () => {
      const error = new DatabaseError('QUOTA_EXCEEDED', 'Storage full');

      expect(error.code).toBe('QUOTA_EXCEEDED');
      expect(error.message).toBe('Storage full');
      expect(error.name).toBe('DatabaseError');
      expect(error.timestamp).toBeGreaterThan(0);
    });

    it('should be instanceof Error', () => {
      const error = new DatabaseError('VALIDATION_FAILED', 'Invalid data');

      expect(error instanceof Error).toBe(true);
      expect(error instanceof DatabaseError).toBe(true);
    });
  });

  describe('Error Factory Functions', () => {
    it('createQuotaExceededError should create proper error', () => {
      const error = createQuotaExceededError(1024);

      expect(error.code).toBe('QUOTA_EXCEEDED');
      expect(error.message).toContain('1024');
    });

    it('createOpfsNotSupportedError should create proper error', () => {
      const error = createOpfsNotSupportedError();

      expect(error.code).toBe('OPFS_NOT_SUPPORTED');
      expect(error.message).toContain('not supported');
    });

    it('createValidationError should include field name', () => {
      const error = createValidationError('queryHash', 'must be non-empty');

      expect(error.code).toBe('VALIDATION_FAILED');
      expect(error.message).toContain('queryHash');
      expect(error.message).toContain('must be non-empty');
    });
  });

  describe('Type Guards', () => {
    it('isDatabaseError should return true for DatabaseError', () => {
      const dbError = new DatabaseError('CONFIG_INVALID', 'Bad config');
      const regularError = new Error('Regular error');

      expect(isDatabaseError(dbError)).toBe(true);
      expect(isDatabaseError(regularError)).toBe(false);
      expect(isDatabaseError(null)).toBe(false);
      expect(isDatabaseError('string')).toBe(false);
    });

    it('hasErrorCode should check specific code', () => {
      const error = createQuotaExceededError(512);

      expect(hasErrorCode(error, 'QUOTA_EXCEEDED')).toBe(true);
      expect(hasErrorCode(error, 'VALIDATION_FAILED')).toBe(false);
    });

    it('isQuotaExceededError should detect quota errors', () => {
      const dbError = createQuotaExceededError(1024);
      const domException = new DOMException('Quota exceeded', 'QuotaExceededError');
      const otherError = new Error('Other error');

      expect(isQuotaExceededError(dbError)).toBe(true);
      expect(isQuotaExceededError(domException)).toBe(true);
      expect(isQuotaExceededError(otherError)).toBe(false);
    });
  });
});

// =============================================================================
// Hash Utility Tests
// =============================================================================

describe('Hash Utilities', () => {
  describe('hashPayloadSync', () => {
    it('should generate consistent hash for same input', () => {
      const payload = { name: 'test', value: 123 };

      const hash1 = hashPayloadSync(payload);
      const hash2 = hashPayloadSync(payload);

      expect(hash1).toBe(hash2);
    });

    it('should generate different hash for different input', () => {
      const hash1 = hashPayloadSync({ a: 1 });
      const hash2 = hashPayloadSync({ a: 2 });

      expect(hash1).not.toBe(hash2);
    });

    it('should handle complex objects', () => {
      const complex = {
        users: [{ id: 1, name: 'Alice' }],
        metadata: { created: '2024-01-01' },
      };

      const hash = hashPayloadSync(complex);
      expect(hash).toBeTruthy();
      expect(typeof hash).toBe('string');
    });
  });

  describe('hashPayloadAsync (async)', () => {
    it('should generate SHA-256 hash', async () => {
      const payload = { test: 'data' };

      const hash = await hashPayloadAsync(payload);

      expect(hash).toBeTruthy();
      expect(hash.length).toBe(64); // SHA-256 produces 64 hex chars
    });

    it('should be consistent', async () => {
      const payload = { key: 'value' };

      const hash1 = await hashPayloadAsync(payload);
      const hash2 = await hashPayloadAsync(payload);

      expect(hash1).toBe(hash2);
    });
  });

  describe('generateIdempotencyKey', () => {
    it('should use custom key if provided', () => {
      const key = generateIdempotencyKey({
        tableName: 'users',
        entityId: '123',
        payload: { name: 'test' },
        customKey: 'my-custom-key',
      });

      expect(key).toBe('my-custom-key');
    });

    it('should generate key from payload hash', () => {
      const key = generateIdempotencyKey({
        tableName: 'users',
        entityId: '123',
        payload: { name: 'test' },
      });

      expect(key).toMatch(/^users:123:/);
    });

    it('should generate same key for same payload (idempotency)', () => {
      const options = {
        tableName: 'users',
        entityId: '123',
        payload: { name: 'test' },
      };

      const key1 = generateIdempotencyKey(options);
      const key2 = generateIdempotencyKey(options);

      expect(key1).toBe(key2);
    });

    it('should generate different key for different payload', () => {
      const key1 = generateIdempotencyKey({
        tableName: 'users',
        entityId: '123',
        payload: { name: 'Alice' },
      });

      const key2 = generateIdempotencyKey({
        tableName: 'users',
        entityId: '123',
        payload: { name: 'Bob' },
      });

      expect(key1).not.toBe(key2);
    });
  });

  // Note: hashQueryKey tests are in @open-insights-web/foundation-data-model
});

// =============================================================================
// Validation Tests
// =============================================================================

describe('Validation Schemas', () => {
  describe('queryCacheEntrySchema', () => {
    const validEntry = {
      queryHash: 'abc123',
      queryKey: ['users', 'list'],
      tableName: 'users',
      data: [{ id: 1 }],
      dataUpdatedAt: Date.now(),
      expiresAt: Date.now() + 60000,
      schemaVersion: 1,
      isOfflineData: false,
    };

    it('should validate correct entry', () => {
      const result = queryCacheEntrySchema.safeParse(validEntry);

      expect(result.success).toBe(true);
    });

    it('should reject empty queryHash', () => {
      const invalid = { ...validEntry, queryHash: '' };
      const result = queryCacheEntrySchema.safeParse(invalid);

      expect(result.success).toBe(false);
    });

    it('should reject negative timestamp', () => {
      const invalid = { ...validEntry, dataUpdatedAt: -1 };
      const result = queryCacheEntrySchema.safeParse(invalid);

      expect(result.success).toBe(false);
    });

    it('should allow optional etag', () => {
      const withEtag = { ...validEntry, etag: 'W/"abc"' };
      const result = queryCacheEntrySchema.safeParse(withEtag);

      expect(result.success).toBe(true);
    });
  });

  describe('mutationQueueEntrySchema', () => {
    const validMutation = {
      id: 'mut-123',
      idempotencyKey: 'users:123:abc',
      timestamp: Date.now(),
      status: 'pending' as const,
      type: 'create' as const,
      tableName: 'users',
      entityId: '123',
      payload: { name: 'Test' },
      retryCount: 0,
    };

    it('should validate correct mutation', () => {
      const result = mutationQueueEntrySchema.safeParse(validMutation);

      expect(result.success).toBe(true);
    });

    it('should reject invalid status', () => {
      const invalid = { ...validMutation, status: 'invalid_status' };
      const result = mutationQueueEntrySchema.safeParse(invalid);

      expect(result.success).toBe(false);
    });

    it('should reject invalid type', () => {
      const invalid = { ...validMutation, type: 'invalid_type' };
      const result = mutationQueueEntrySchema.safeParse(invalid);

      expect(result.success).toBe(false);
    });

    it('should allow optional conflictStrategy', () => {
      const withStrategy = { ...validMutation, conflictStrategy: 'server-wins' };
      const result = mutationQueueEntrySchema.safeParse(withStrategy);

      expect(result.success).toBe(true);
    });
  });

  describe('createValidator', () => {
    it('should create working validator', () => {
      const validator = createValidator(queryCacheEntrySchema);

      const validResult = validator({
        queryHash: 'test',
        queryKey: [],
        tableName: 'test',
        data: null,
        dataUpdatedAt: 1,
        expiresAt: 2,
        schemaVersion: 1,
        isOfflineData: false,
      });

      expect(validResult.success).toBe(true);
    });

    it('should return error message on failure', () => {
      const validator = createValidator(queryCacheEntrySchema);

      const invalidResult = validator({ invalid: 'data' });

      expect(invalidResult.success).toBe(false);
      if (!invalidResult.success) {
        expect(invalidResult.error).toBeTruthy();
      }
    });
  });

  describe('Pre-built Validators', () => {
    it('validateQueryCacheEntry should work', () => {
      const result = validateQueryCacheEntry({
        queryHash: 'test',
        queryKey: ['a'],
        tableName: 'users',
        data: {},
        dataUpdatedAt: Date.now(),
        expiresAt: Date.now() + 1000,
        schemaVersion: 1,
        isOfflineData: false,
      });

      expect(result.success).toBe(true);
    });
  });
});

// =============================================================================
// Config Tests
// =============================================================================

describe('Config', () => {
  it('should provide default config', async () => {
    const { DEFAULT_DATABASE_CONFIG } = await import('./core/config');

    expect(DEFAULT_DATABASE_CONFIG.name).toBe('open-insights-db');
    expect(DEFAULT_DATABASE_CONFIG.version).toBe(1);
    expect(DEFAULT_DATABASE_CONFIG.queryCacheTTL).toBe(5 * 60 * 1000);
    expect(DEFAULT_DATABASE_CONFIG.maxRetryAttempts).toBe(3);
  });

  it('mergeConfig should override defaults', async () => {
    const { mergeConfig } = await import('./core/config');

    const merged = mergeConfig({ name: 'custom-db', debug: true });

    expect(merged.name).toBe('custom-db');
    expect(merged.debug).toBe(true);
    expect(merged.version).toBe(1); // default preserved
  });
});

// =============================================================================
// Sync State Type Guards Tests
// =============================================================================

describe('Sync State Type Guards', () => {
  it('isLastSyncValue should validate correctly', async () => {
    const { isLastSyncValue } = await import('./tables/sync-state');

    expect(isLastSyncValue({ timestamp: 123, tables: {} })).toBe(true);
    expect(isLastSyncValue({ timestamp: 123 })).toBe(false);
    expect(isLastSyncValue(null)).toBe(false);
    expect(isLastSyncValue('string')).toBe(false);
  });

  it('isNetworkStatus should validate correctly', async () => {
    const { isNetworkStatus } = await import('./tables/sync-state');

    expect(
      isNetworkStatus({
        isOnline: true,
        lastOnlineAt: null,
        lastOfflineAt: null,
      })
    ).toBe(true);

    expect(isNetworkStatus({ isOnline: 'not boolean' })).toBe(false);
    expect(isNetworkStatus({})).toBe(false);
  });

  it('isDuckDBViewsValue should validate correctly', async () => {
    const { isDuckDBViewsValue } = await import('./tables/sync-state');

    expect(isDuckDBViewsValue({ views: [], lastUpdatedAt: 0 })).toBe(true);
    expect(isDuckDBViewsValue({ views: 'not array' })).toBe(false);
    expect(isDuckDBViewsValue({})).toBe(false);
  });
});
