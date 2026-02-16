/**
 * Convex Identity Helpers
 *
 * Server-side utilities for working with authenticated users in Convex functions.
 *
 * @module convex/identity-helpers
 */

import { AUTH_ERROR_CODE, type AuthErrorCode } from '../core/constants';
import type { UserRole } from '../core/types';
import { AuthError } from '../errors/auth-errors';

// =============================================================================
// Types
// =============================================================================

/**
 * Convex context with auth
 */
export interface ConvexAuthContext {
  auth: {
    getUserIdentity: () => Promise<ConvexUserIdentity | null>;
  };
}

/**
 * User identity from Convex auth
 *
 * This represents the JWT claims from the OIDC provider (Ory).
 */
export interface ConvexUserIdentity {
  /** Subject (user ID from Ory) */
  subject: string;
  /** Email address */
  email?: string;
  /** Email verified flag */
  emailVerified?: boolean;
  /** Name */
  name?: string;
  /** Given name (first name) */
  givenName?: string;
  /** Family name (last name) */
  familyName?: string;
  /** Picture URL */
  picture?: string;
  /** Custom claims from Ory identity traits */
  role?: string;
  tenantId?: string;
  /** Token issuer */
  issuer: string;
  /** Token audience */
  audience?: string;
  /** Token expiration time */
  tokenIdentifier: string;
}

/**
 * Authenticated user in Convex
 */
export interface ConvexAuthUser {
  /** User ID (from Ory identity) */
  id: string;
  /** Email address */
  email: string;
  /** User role */
  role: UserRole;
  /** Tenant ID */
  tenantId: string | null;
  /** Raw identity */
  identity: ConvexUserIdentity;
}

// =============================================================================
// Error Classes
// =============================================================================

/**
 * Error thrown when authentication is required but not present.
 *
 * Extends {@link AuthError} so it integrates with the foundation error
 * infrastructure and can be caught via `isAuthError()`.
 */
export class UnauthorizedError extends AuthError {
  readonly authCode: AuthErrorCode = AUTH_ERROR_CODE.UNAUTHORIZED;

  constructor(message = 'Authentication required', cause?: Error) {
    super(message, {}, cause);
    this.name = 'UnauthorizedError';
  }
}

/**
 * Error thrown when user doesn't have required permissions.
 *
 * Extends {@link AuthError} so it integrates with the foundation error
 * infrastructure and can be caught via `isAuthError()`.
 */
export class ForbiddenError extends AuthError {
  readonly authCode: AuthErrorCode = AUTH_ERROR_CODE.PERMISSION_DENIED;

  readonly requiredRoles?: UserRole[];

  constructor(message = 'Permission denied', requiredRoles?: UserRole[], cause?: Error) {
    super(message, { requiredRoles }, cause);
    this.name = 'ForbiddenError';
    this.requiredRoles = requiredRoles;
  }
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Default role for users without explicit role claim
 */
const DEFAULT_ROLE: UserRole = 'viewer';

/**
 * Valid user roles
 */
const VALID_ROLES: UserRole[] = ['owner', 'admin', 'member', 'viewer', 'guest'];

/**
 * Require authentication in a Convex function
 *
 * Returns the authenticated user identity or throws UnauthorizedError.
 *
 * @param ctx - Convex context
 * @returns User identity
 * @throws {UnauthorizedError} If user is not authenticated
 *
 * @example
 * ```typescript
 * // In a Convex query or mutation
 * export const myQuery = query({
 *   handler: async (ctx) => {
 *     const identity = await requireAuth(ctx);
 *     // identity.subject is the user ID
 *     // identity.email is the user's email
 *     return { userId: identity.subject };
 *   },
 * });
 * ```
 */
export const requireAuth = async (ctx: ConvexAuthContext): Promise<ConvexUserIdentity> => {
  const identity = await ctx.auth.getUserIdentity();

  if (!identity) {
    throw new UnauthorizedError();
  }

  return identity;
};

/**
 * Require authentication and return a structured user object
 *
 * @param ctx - Convex context
 * @returns Authenticated user
 * @throws {UnauthorizedError} If user is not authenticated
 *
 * @example
 * ```typescript
 * export const myQuery = query({
 *   handler: async (ctx) => {
 *     const user = await requireAuthUser(ctx);
 *     console.log(user.role); // 'admin', 'member', etc.
 *     console.log(user.tenantId); // User's tenant
 *   },
 * });
 * ```
 */
export const requireAuthUser = async (ctx: ConvexAuthContext): Promise<ConvexAuthUser> => {
  const identity = await requireAuth(ctx);

  // Extract and validate role
  let role: UserRole = DEFAULT_ROLE;
  if (identity.role && VALID_ROLES.includes(identity.role as UserRole)) {
    role = identity.role as UserRole;
  }

  return {
    id: identity.subject,
    email: identity.email ?? '',
    role,
    tenantId: identity.tenantId ?? null,
    identity,
  };
};

/**
 * Require specific role(s) in a Convex function
 *
 * @param ctx - Convex context
 * @param allowedRoles - Roles that are allowed
 * @returns User identity
 * @throws {UnauthorizedError} If user is not authenticated
 * @throws {ForbiddenError} If user doesn't have required role
 *
 * @example
 * ```typescript
 * export const adminOnlyMutation = mutation({
 *   handler: async (ctx) => {
 *     const identity = await requireRole(ctx, ['admin', 'owner']);
 *     // Only admins and owners can reach here
 *   },
 * });
 * ```
 */
export const requireRole = async (
  ctx: ConvexAuthContext,
  allowedRoles: UserRole[],
): Promise<ConvexUserIdentity> => {
  const identity = await requireAuth(ctx);

  // Extract role from identity
  const userRole = (identity.role as UserRole) ?? DEFAULT_ROLE;

  if (!allowedRoles.includes(userRole)) {
    throw new ForbiddenError(`Requires one of: ${allowedRoles.join(', ')}`, allowedRoles);
  }

  return identity;
};

/**
 * Require admin or owner role
 *
 * Convenience function for admin-only operations.
 *
 * @param ctx - Convex context
 * @returns User identity
 *
 * @example
 * ```typescript
 * export const deleteUser = mutation({
 *   handler: async (ctx, { userId }) => {
 *     await requireAdmin(ctx);
 *     // Only admins/owners can delete users
 *   },
 * });
 * ```
 */
export const requireAdmin = async (ctx: ConvexAuthContext): Promise<ConvexUserIdentity> =>
  requireRole(ctx, ['admin', 'owner']);

/**
 * Require owner role
 *
 * Convenience function for owner-only operations.
 *
 * @param ctx - Convex context
 * @returns User identity
 */
export const requireOwner = async (ctx: ConvexAuthContext): Promise<ConvexUserIdentity> =>
  requireRole(ctx, ['owner']);

/**
 * Get optional user identity (doesn't throw if not authenticated)
 *
 * @param ctx - Convex context
 * @returns User identity or null
 *
 * @example
 * ```typescript
 * export const publicQuery = query({
 *   handler: async (ctx) => {
 *     const identity = await getOptionalAuth(ctx);
 *     if (identity) {
 *       return { message: `Hello, ${identity.name}!` };
 *     }
 *     return { message: 'Hello, guest!' };
 *   },
 * });
 * ```
 */
export const getOptionalAuth = async (
  ctx: ConvexAuthContext,
): Promise<ConvexUserIdentity | null> => {
  return ctx.auth.getUserIdentity();
};

/**
 * Check if user has specific role without throwing
 *
 * @param ctx - Convex context
 * @param allowedRoles - Roles to check
 * @returns True if user has one of the allowed roles
 *
 * @example
 * ```typescript
 * export const conditionalQuery = query({
 *   handler: async (ctx) => {
 *     const isAdmin = await hasRole(ctx, ['admin', 'owner']);
 *     if (isAdmin) {
 *       return { sensitiveData: '...' };
 *     }
 *     return { publicData: '...' };
 *   },
 * });
 * ```
 */
export const hasRole = async (
  ctx: ConvexAuthContext,
  allowedRoles: UserRole[],
): Promise<boolean> => {
  const identity = await getOptionalAuth(ctx);
  if (!identity) return false;

  const userRole = (identity.role as UserRole) ?? DEFAULT_ROLE;
  return allowedRoles.includes(userRole);
};

/**
 * Require user belongs to specific tenant
 *
 * @param ctx - Convex context
 * @param tenantId - Required tenant ID
 * @returns User identity
 * @throws {UnauthorizedError} If not authenticated
 * @throws {ForbiddenError} If user doesn't belong to tenant
 *
 * @example
 * ```typescript
 * export const tenantQuery = query({
 *   args: { tenantId: v.string() },
 *   handler: async (ctx, { tenantId }) => {
 *     await requireTenant(ctx, tenantId);
 *     // User belongs to this tenant
 *   },
 * });
 * ```
 */
export const requireTenant = async (
  ctx: ConvexAuthContext,
  tenantId: string,
): Promise<ConvexUserIdentity> => {
  const identity = await requireAuth(ctx);

  if (identity.tenantId !== tenantId) {
    throw new ForbiddenError('Access denied to this tenant');
  }

  return identity;
};
