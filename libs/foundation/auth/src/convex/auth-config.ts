/**
 * Convex Auth Configuration
 *
 * Helpers for configuring Convex with Ory OIDC provider.
 *
 * @module convex/auth-config
 */

// =============================================================================
// Types
// =============================================================================

/**
 * Configuration for Ory as an OIDC provider for Convex
 */
export interface OryAuthProviderConfig {
  /** OIDC issuer URL (Ory Hydra or Ory Network) */
  issuer: string;
  /** Convex application ID */
  applicationId: string;
}

/**
 * Convex auth provider configuration
 * This is the format expected by Convex's auth configuration
 */
export interface ConvexAuthProvider {
  /** OIDC domain (issuer URL) */
  domain: string;
  /** Application/Client ID */
  applicationID: string;
}

// =============================================================================
// Configuration Helpers
// =============================================================================

/**
 * Create Ory auth provider configuration for Convex
 *
 * Use this to configure Convex with Ory as the OIDC provider.
 *
 * @param config - Ory provider configuration
 * @returns Convex auth provider configuration
 *
 * @example
 * ```typescript
 * // In your Convex auth config (convex/auth.config.ts)
 * import { createOryAuthProvider } from '@open-insights-web/foundation-auth/convex';
 *
 * export default {
 *   providers: [
 *     createOryAuthProvider({
 *       issuer: 'https://your-project.ory.cloud',
 *       applicationId: 'your-application-id',
 *     }),
 *   ],
 * };
 * ```
 */
export const createOryAuthProvider = (config: OryAuthProviderConfig): ConvexAuthProvider => {
  if (!config.issuer) {
    throw new Error('[createOryAuthProvider] issuer is required');
  }
  if (!config.applicationId) {
    throw new Error('[createOryAuthProvider] applicationId is required');
  }

  // Normalize issuer URL (remove trailing slash)
  const domain = config.issuer.replace(/\/+$/, '');

  return {
    domain,
    applicationID: config.applicationId,
  };
};

/**
 * Create auth provider config from environment variables
 *
 * @param envPrefix - Prefix for environment variables (default: 'ORY')
 * @returns Convex auth provider configuration
 *
 * @example
 * ```typescript
 * // Expects ORY_ISSUER and ORY_APPLICATION_ID environment variables
 * const provider = createOryAuthProviderFromEnv();
 *
 * // Or with custom prefix
 * // Expects AUTH_ISSUER and AUTH_APPLICATION_ID
 * const provider = createOryAuthProviderFromEnv('AUTH');
 * ```
 */
export const createOryAuthProviderFromEnv = (envPrefix = 'ORY'): ConvexAuthProvider => {
  const issuer = process.env[`${envPrefix}_ISSUER`];
  const applicationId = process.env[`${envPrefix}_APPLICATION_ID`];

  if (!issuer) {
    throw new Error(
      `[createOryAuthProviderFromEnv] ${envPrefix}_ISSUER environment variable is required`,
    );
  }
  if (!applicationId) {
    throw new Error(
      `[createOryAuthProviderFromEnv] ${envPrefix}_APPLICATION_ID environment variable is required`,
    );
  }

  return createOryAuthProvider({ issuer, applicationId });
};
