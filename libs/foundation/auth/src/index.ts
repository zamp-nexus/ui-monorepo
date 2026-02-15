/**
 * @open-insights-web/foundation-auth
 *
 * Enterprise-grade authentication library integrating Ory with Convex.
 *
 * @packageDocumentation
 */

// =============================================================================
// Provider
// =============================================================================

export { AuthProvider } from './providers';

// =============================================================================
// Contexts
// =============================================================================

export {
  AuthContext,
  useAuthContext,
  AuthInternalsContext,
  useAuthInternals,
  useRequiredAuthInternals,
} from './providers';

// =============================================================================
// Hooks
// =============================================================================

export {
  // Main hook
  useAuth,
  // User hooks
  useAuthUser,
  useRequiredAuthUser,
  // Session hook
  useAuthSession,
  // Flow hooks
  useAuthFlow,
  useLoginFlow,
  useRegistrationFlow,
  useRecoveryFlow,
  useVerificationFlow,
  useSettingsFlow,
} from './hooks';

// =============================================================================
// Components
// =============================================================================

export {
  OryElementsProvider,
  useOryElements,
  useOryElementsConfig,
  type OryElementsConfig,
  type OryElementsContextValue,
  type OryElementsProviderProps,
} from './components';

// =============================================================================
// Constants
// =============================================================================

export {
  // Auth flow types
  AUTH_FLOW_TYPE,
  type AuthFlowType,
  // Auth states
  AUTH_STATE,
  type AuthStateType,
  // Auth error codes
  AUTH_ERROR_CODE,
  type AuthErrorCode,
  // Session states
  SESSION_STATE,
  type SessionStateType,
  // Flow states
  FLOW_STATE,
  type FlowStateType,
  // Identity traits
  IDENTITY_TRAIT,
  type IdentityTraitKey,
  // Default config
  DEFAULT_AUTH_CONFIG,
} from './core';

// =============================================================================
// Types
// =============================================================================

// User role and permissions
export type { UserRole, UserPermissions } from './core';
export { USER_ROLES, isValidRole, getUserPermissions } from './core';

export type {
  // Configuration
  OryConfig,
  ConvexAuthConfig,
  AuthConfig,
  // Session
  AuthSession,
  SessionStateChangeEvent,
  SessionStateListener,
  // Identity
  IdentityTraits,
  TypedIdentity,
  VerifiableAddress,
  RecoveryAddress,
  // User
  AuthUser,
  // Auth state
  AuthState,
  AuthStateChangeEvent,
  AuthStateListener,
  // Flows
  OryFlow,
  FlowState,
  LoginFlowState,
  RegistrationFlowState,
  RecoveryFlowState,
  VerificationFlowState,
  SettingsFlowState,
  // Flow submissions
  LoginSubmission,
  RegistrationSubmission,
  RecoverySubmission,
  VerificationSubmission,
  SettingsSubmission,
  // Context
  AuthContextValue,
  AuthInternals,
  // Service interfaces
  SessionServiceInterface,
  FlowServiceInterface,
  UserServiceInterface,
  AuthFacadeInterface,
  // Provider props
  AuthProviderProps,
  // Hook return types
  UseAuthResult,
  UseAuthUserResult,
  UseRequiredAuthUserResult,
  UseAuthSessionResult,
  UseAuthFlowOptions,
  UseAuthFlowResult,
} from './core';

// =============================================================================
// Errors
// =============================================================================

export {
  // Base class
  AuthError,
  // Initialization errors
  AuthNotInitializedError,
  // Session errors
  SessionCheckError,
  SessionRefreshError,
  SessionExpiredError,
  LogoutError,
  // Flow errors
  FlowCreationError,
  FlowNotFoundError,
  FlowSubmissionError,
  FlowExpiredError,
  // Authentication errors
  InvalidCredentialsError,
  UserNotFoundError,
  // Authorization errors
  PermissionDeniedError,
  // Token errors
  TokenRetrievalError,
  TokenExpiredError,
  // Configuration errors
  ClientConfigError,
  // Network errors
  AuthNetworkError,
  // Type guards
  isAuthError,
  hasAuthErrorCode,
  isSessionError,
  isFlowError,
  isTokenError,
  isRetryableAuthError,
} from './errors';

// =============================================================================
// Utilities
// =============================================================================

export {
  // Token decoding
  decodeJwt,
  decodeJwtPayload,
  // Token validation
  isTokenExpired,
  getTokenExpiration,
  getTimeUntilExpiration,
  // Claim extraction
  getUserIdFromToken,
  getEmailFromToken,
  getClaimFromToken,
  // Types
  type JwtHeader,
  type JwtStandardClaims,
  type JwtPayload,
  type DecodedJwt,
} from './utils';
