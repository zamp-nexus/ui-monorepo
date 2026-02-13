/**
 * Tests for Convex identity helpers
 *
 * Server-side auth utilities.
 */

import { describe, it, expect, vi } from 'vitest';
import {
  requireAuth,
  requireAuthUser,
  requireRole,
  requireAdmin,
  requireOwner,
  getOptionalAuth,
  hasRole,
  requireTenant,
  UnauthorizedError,
  ForbiddenError,
  type ConvexAuthContext,
  type ConvexUserIdentity,
} from './identity-helpers';

// =============================================================================
// Helpers
// =============================================================================

const createMockIdentity = (overrides: Partial<ConvexUserIdentity> = {}): ConvexUserIdentity => ({
  subject: 'user-123',
  email: 'test@example.com',
  emailVerified: true,
  name: 'Test User',
  role: 'member',
  tenantId: 'tenant-1',
  issuer: 'https://auth.example.com',
  tokenIdentifier: 'https://auth.example.com|user-123',
  ...overrides,
});

const createMockContext = (identity: ConvexUserIdentity | null = null): ConvexAuthContext => ({
  auth: {
    getUserIdentity: vi.fn().mockResolvedValue(identity),
  },
});

// =============================================================================
// Tests
// =============================================================================

describe('identity-helpers', () => {
  // ===========================================================================
  // Error Classes
  // ===========================================================================

  describe('UnauthorizedError', () => {
    it('should create with default message', () => {
      const error = new UnauthorizedError();
      expect(error.message).toBe('Authentication required');
      expect(error.name).toBe('UnauthorizedError');
    });

    it('should create with custom message', () => {
      const error = new UnauthorizedError('Custom message');
      expect(error.message).toBe('Custom message');
    });
  });

  describe('ForbiddenError', () => {
    it('should create with default message', () => {
      const error = new ForbiddenError();
      expect(error.message).toBe('Permission denied');
      expect(error.name).toBe('ForbiddenError');
    });

    it('should store required roles', () => {
      const error = new ForbiddenError('Access denied', ['admin', 'owner']);
      expect(error.requiredRoles).toEqual(['admin', 'owner']);
    });
  });

  // ===========================================================================
  // requireAuth
  // ===========================================================================

  describe('requireAuth', () => {
    it('should return identity when authenticated', async () => {
      const identity = createMockIdentity();
      const ctx = createMockContext(identity);

      const result = await requireAuth(ctx);
      expect(result).toBe(identity);
    });

    it('should throw UnauthorizedError when not authenticated', async () => {
      const ctx = createMockContext(null);
      await expect(requireAuth(ctx)).rejects.toThrow(UnauthorizedError);
    });
  });

  // ===========================================================================
  // requireAuthUser
  // ===========================================================================

  describe('requireAuthUser', () => {
    it('should return structured user object', async () => {
      const identity = createMockIdentity({
        subject: 'user-42',
        email: 'alice@example.com',
        role: 'admin',
        tenantId: 'tenant-5',
      });
      const ctx = createMockContext(identity);

      const user = await requireAuthUser(ctx);
      expect(user.id).toBe('user-42');
      expect(user.email).toBe('alice@example.com');
      expect(user.role).toBe('admin');
      expect(user.tenantId).toBe('tenant-5');
      expect(user.identity).toBe(identity);
    });

    it('should default role to viewer when not set', async () => {
      const identity = createMockIdentity({ role: undefined });
      const ctx = createMockContext(identity);

      const user = await requireAuthUser(ctx);
      expect(user.role).toBe('viewer');
    });

    it('should default role to viewer for invalid role', async () => {
      const identity = createMockIdentity({ role: 'super-admin' });
      const ctx = createMockContext(identity);

      const user = await requireAuthUser(ctx);
      expect(user.role).toBe('viewer');
    });

    it('should default email to empty string when not set', async () => {
      const identity = createMockIdentity({ email: undefined });
      const ctx = createMockContext(identity);

      const user = await requireAuthUser(ctx);
      expect(user.email).toBe('');
    });

    it('should default tenantId to null when not set', async () => {
      const identity = createMockIdentity({ tenantId: undefined });
      const ctx = createMockContext(identity);

      const user = await requireAuthUser(ctx);
      expect(user.tenantId).toBeNull();
    });

    it('should throw when not authenticated', async () => {
      const ctx = createMockContext(null);
      await expect(requireAuthUser(ctx)).rejects.toThrow(UnauthorizedError);
    });
  });

  // ===========================================================================
  // requireRole
  // ===========================================================================

  describe('requireRole', () => {
    it('should allow user with matching role', async () => {
      const identity = createMockIdentity({ role: 'admin' });
      const ctx = createMockContext(identity);

      const result = await requireRole(ctx, ['admin', 'owner']);
      expect(result).toBe(identity);
    });

    it('should throw ForbiddenError for non-matching role', async () => {
      const identity = createMockIdentity({ role: 'viewer' });
      const ctx = createMockContext(identity);

      await expect(requireRole(ctx, ['admin', 'owner'])).rejects.toThrow(ForbiddenError);
    });

    it('should throw UnauthorizedError when not authenticated', async () => {
      const ctx = createMockContext(null);
      await expect(requireRole(ctx, ['admin'])).rejects.toThrow(UnauthorizedError);
    });

    it('should use default role (viewer) when role not set', async () => {
      const identity = createMockIdentity({ role: undefined });
      const ctx = createMockContext(identity);

      // Should succeed when viewer is in allowed roles
      const result = await requireRole(ctx, ['viewer', 'member']);
      expect(result).toBe(identity);
    });
  });

  // ===========================================================================
  // requireAdmin
  // ===========================================================================

  describe('requireAdmin', () => {
    it('should allow admin', async () => {
      const identity = createMockIdentity({ role: 'admin' });
      const ctx = createMockContext(identity);
      await expect(requireAdmin(ctx)).resolves.toBe(identity);
    });

    it('should allow owner', async () => {
      const identity = createMockIdentity({ role: 'owner' });
      const ctx = createMockContext(identity);
      await expect(requireAdmin(ctx)).resolves.toBe(identity);
    });

    it('should reject member', async () => {
      const identity = createMockIdentity({ role: 'member' });
      const ctx = createMockContext(identity);
      await expect(requireAdmin(ctx)).rejects.toThrow(ForbiddenError);
    });
  });

  // ===========================================================================
  // requireOwner
  // ===========================================================================

  describe('requireOwner', () => {
    it('should allow owner', async () => {
      const identity = createMockIdentity({ role: 'owner' });
      const ctx = createMockContext(identity);
      await expect(requireOwner(ctx)).resolves.toBe(identity);
    });

    it('should reject admin', async () => {
      const identity = createMockIdentity({ role: 'admin' });
      const ctx = createMockContext(identity);
      await expect(requireOwner(ctx)).rejects.toThrow(ForbiddenError);
    });
  });

  // ===========================================================================
  // getOptionalAuth
  // ===========================================================================

  describe('getOptionalAuth', () => {
    it('should return identity when authenticated', async () => {
      const identity = createMockIdentity();
      const ctx = createMockContext(identity);

      const result = await getOptionalAuth(ctx);
      expect(result).toBe(identity);
    });

    it('should return null when not authenticated', async () => {
      const ctx = createMockContext(null);

      const result = await getOptionalAuth(ctx);
      expect(result).toBeNull();
    });
  });

  // ===========================================================================
  // hasRole
  // ===========================================================================

  describe('hasRole', () => {
    it('should return true when user has matching role', async () => {
      const identity = createMockIdentity({ role: 'admin' });
      const ctx = createMockContext(identity);
      expect(await hasRole(ctx, ['admin', 'owner'])).toBe(true);
    });

    it('should return false when user has non-matching role', async () => {
      const identity = createMockIdentity({ role: 'viewer' });
      const ctx = createMockContext(identity);
      expect(await hasRole(ctx, ['admin', 'owner'])).toBe(false);
    });

    it('should return false when not authenticated', async () => {
      const ctx = createMockContext(null);
      expect(await hasRole(ctx, ['admin'])).toBe(false);
    });
  });

  // ===========================================================================
  // requireTenant
  // ===========================================================================

  describe('requireTenant', () => {
    it('should allow user from matching tenant', async () => {
      const identity = createMockIdentity({ tenantId: 'tenant-1' });
      const ctx = createMockContext(identity);

      const result = await requireTenant(ctx, 'tenant-1');
      expect(result).toBe(identity);
    });

    it('should throw ForbiddenError for wrong tenant', async () => {
      const identity = createMockIdentity({ tenantId: 'tenant-1' });
      const ctx = createMockContext(identity);

      await expect(requireTenant(ctx, 'tenant-2')).rejects.toThrow(ForbiddenError);
    });

    it('should throw UnauthorizedError when not authenticated', async () => {
      const ctx = createMockContext(null);
      await expect(requireTenant(ctx, 'tenant-1')).rejects.toThrow(UnauthorizedError);
    });
  });
});
