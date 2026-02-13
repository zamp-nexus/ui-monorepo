/**
 * Convex Module
 *
 * Convex integration for authentication.
 *
 * @module convex
 */

// Auth config
export {
  createOryAuthProvider,
  createOryAuthProviderFromEnv,
  type OryAuthProviderConfig,
  type ConvexAuthProvider,
} from './auth-config';

// Identity helpers
export {
  // Functions
  requireAuth,
  requireAuthUser,
  requireRole,
  requireAdmin,
  requireOwner,
  getOptionalAuth,
  hasRole,
  requireTenant,
  // Errors
  UnauthorizedError,
  ForbiddenError,
  // Types
  type ConvexAuthContext,
  type ConvexUserIdentity,
  type ConvexAuthUser,
} from './identity-helpers';
