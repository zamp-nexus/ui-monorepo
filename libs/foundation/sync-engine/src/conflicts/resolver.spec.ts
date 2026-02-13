/**
 * Tests for ConflictResolver
 */

import { describe, it, expect, beforeEach } from 'vitest';
import type { ConflictContext } from '@open-insights-web/foundation-data-model';
import { ConflictResolver } from './resolver';

describe('ConflictResolver', () => {
  let resolver: ConflictResolver;

  beforeEach(() => {
    resolver = new ConflictResolver({
      defaultStrategy: 'last-write-wins',
      debug: false,
    });
  });

  describe('getStrategy', () => {
    it('should return default strategy when no table override', () => {
      expect(resolver.getStrategy('users')).toBe('last-write-wins');
    });

    it('should return table-specific strategy when set', () => {
      resolver.setTableStrategy('users', 'server-wins');

      expect(resolver.getStrategy('users')).toBe('server-wins');
      expect(resolver.getStrategy('posts')).toBe('last-write-wins');
    });
  });

  describe('resolve with server-wins strategy', () => {
    beforeEach(() => {
      resolver = new ConflictResolver({
        defaultStrategy: 'server-wins',
      });
    });

    it('should always return server data', () => {
      const context: ConflictContext = {
        serverData: { name: 'Server Name' },
        serverTimestamp: 1000,
        clientData: { name: 'Client Name' },
        clientTimestamp: 2000,
        tableName: 'users',
        entityId: '123',
      };

      const result = resolver.resolve(context);

      expect(result.resolvedData).toEqual({ name: 'Server Name' });
      expect(result.winner).toBe('server');
      expect(result.requiresReview).toBe(false);
    });
  });

  describe('resolve with client-wins strategy', () => {
    beforeEach(() => {
      resolver = new ConflictResolver({
        defaultStrategy: 'client-wins',
      });
    });

    it('should always return client data', () => {
      const context: ConflictContext = {
        serverData: { name: 'Server Name' },
        serverTimestamp: 2000,
        clientData: { name: 'Client Name' },
        clientTimestamp: 1000,
        tableName: 'users',
        entityId: '123',
      };

      const result = resolver.resolve(context);

      expect(result.resolvedData).toEqual({ name: 'Client Name' });
      expect(result.winner).toBe('client');
      expect(result.requiresReview).toBe(false);
    });
  });

  describe('resolve with last-write-wins strategy', () => {
    it('should return client data when client timestamp is newer', () => {
      const context: ConflictContext = {
        serverData: { name: 'Server Name' },
        serverTimestamp: 1000,
        clientData: { name: 'Client Name' },
        clientTimestamp: 2000,
        tableName: 'users',
        entityId: '123',
      };

      const result = resolver.resolve(context);

      expect(result.resolvedData).toEqual({ name: 'Client Name' });
      expect(result.winner).toBe('client');
    });

    it('should return server data when server timestamp is newer', () => {
      const context: ConflictContext = {
        serverData: { name: 'Server Name' },
        serverTimestamp: 2000,
        clientData: { name: 'Client Name' },
        clientTimestamp: 1000,
        tableName: 'users',
        entityId: '123',
      };

      const result = resolver.resolve(context);

      expect(result.resolvedData).toEqual({ name: 'Server Name' });
      expect(result.winner).toBe('server');
    });
  });

  describe('resolve with merge strategy', () => {
    beforeEach(() => {
      resolver = new ConflictResolver({
        defaultStrategy: 'merge',
      });
    });

    it('should merge non-conflicting changes', () => {
      const context: ConflictContext<Record<string, unknown>> = {
        serverData: { name: 'Server Name', age: 30 },
        serverTimestamp: 1000,
        clientData: { name: 'Server Name', email: 'client@test.com' },
        clientTimestamp: 2000,
        tableName: 'users',
        entityId: '123',
        baseData: { name: 'Server Name' },
      };

      const result = resolver.resolve(context);

      expect(result.resolvedData).toEqual({
        name: 'Server Name',
        age: 30,
        email: 'client@test.com',
      });
    });

    it('should flag conflicting changes for review', () => {
      const context: ConflictContext<Record<string, unknown>> = {
        serverData: { name: 'Server Name' },
        serverTimestamp: 1000,
        clientData: { name: 'Client Name' },
        clientTimestamp: 2000,
        tableName: 'users',
        entityId: '123',
        baseData: { name: 'Original Name' },
      };

      const result = resolver.resolve(context);

      expect(result.requiresReview).toBe(true);
      expect(result.conflictedFields).toContain('name');
    });
  });

  describe('hasConflict', () => {
    it('should return false when data is equal', () => {
      const hasConflict = resolver.hasConflict(
        { name: 'Same' },
        { name: 'Same' },
        1000,
        2000
      );

      expect(hasConflict).toBe(false);
    });

    it('should return false when timestamps are equal', () => {
      const hasConflict = resolver.hasConflict(
        { name: 'Server' },
        { name: 'Client' },
        1000,
        1000
      );

      expect(hasConflict).toBe(false);
    });

    it('should return true when server is newer and data differs', () => {
      const hasConflict = resolver.hasConflict(
        { name: 'Server' },
        { name: 'Client' },
        2000,
        1000
      );

      expect(hasConflict).toBe(true);
    });

    it('should return false when client is newer (no server conflict)', () => {
      const hasConflict = resolver.hasConflict(
        { name: 'Server' },
        { name: 'Client' },
        1000,
        2000
      );

      expect(hasConflict).toBe(false);
    });
  });

  describe('setTableStrategy', () => {
    it('should override strategy for specific table', () => {
      resolver.setTableStrategy('important_data', 'server-wins');

      expect(resolver.getStrategy('important_data')).toBe('server-wins');
      expect(resolver.getStrategy('other_table')).toBe('last-write-wins');
    });
  });

  describe('setTableMergeConfig', () => {
    it('should apply custom merge config for specific table', () => {
      resolver = new ConflictResolver({
        defaultStrategy: 'merge',
      });

      resolver.setTableMergeConfig('users', {
        clientWinsFields: ['email'],
      });

      const context: ConflictContext<{ email: string }> = {
        serverData: { email: 'server@test.com' },
        serverTimestamp: 2000,
        clientData: { email: 'client@test.com' },
        clientTimestamp: 1000,
        tableName: 'users',
        entityId: '123',
        baseData: { email: 'original@test.com' },
      };

      const result = resolver.resolve(context);

      expect(result.resolvedData.email).toBe('client@test.com');
    });
  });
});
