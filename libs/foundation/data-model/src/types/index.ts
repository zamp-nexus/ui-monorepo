/**
 * Type exports
 * @module types
 */

// Base types
export type {
  Timestamps,
  BaseEntity,
  SoftDelete,
  TenantScoped,
  PaginationParams,
  SortDirection,
  DateRange,
  PaginatedResponse,
  ApiResponse,
  ApiError,
  MutationResult,
  // Data source types
  DataSource,
  OfflineDataSource,
  OfflineMetadata,
  WithOfflineMetadata,
  IdMapping,
  SimpleValidationResult,
} from './base';

// User types
export type {
  UserRole,
  UserStatus,
  UserPreferences,
  User,
  CreateUser,
  UpdateUser,
  UserFilters,
  UserWithRelations,
  UserProfile,
  UserPermissions,
} from './user';
export { getUserPermissions } from './user';

// Event types
export type {
  EventType,
  DeviceType,
  BrowserInfo,
  DeviceInfo,
  GeoLocation,
  PageContext,
  UtmParams,
  Event,
  CreateEvent,
  EventFilters,
  EventAggregation,
  EventWithComputed,
  EventBatch,
  EventCountByType,
  EventTimelineEntry,
  CommonEventProperty,
} from './event';
export { COMMON_EVENT_PROPERTIES } from './event';

// Session types
export type {
  SessionStatus,
  LandingPage,
  ExitPage,
  SessionMetrics,
  Session,
  CreateSession,
  UpdateSession,
  SessionFilters,
  SessionSummary,
  SessionWithEvents,
  SessionReplay,
  SessionFunnelStep,
  SessionCohort,
  ActiveSession,
  SessionTimeoutConfig,
} from './session';
export { DEFAULT_SESSION_TIMEOUT } from './session';

// JSON-serializable types
export type {
  JsonPrimitive,
  JsonObject,
  JsonArray,
  JsonValue,
  JsonSerializable,
} from './json-serializable';
export {
  isJsonSerializable,
  cloneJsonSerializable,
  toJsonSerializable,
  tryToJsonSerializable,
  assertJsonSerializable,
  JsonSerializationError,
} from './json-serializable';

// Result type for type-safe error handling (value export includes type)
export { Result } from './result';

// Branded types for type-safe primitives
// Brand is type-only; Milliseconds and Timestamp have both type and value exports
export type { Brand } from './branded';
// Value exports include their associated types automatically
export { Milliseconds, Timestamp, BrandedTypeValidationError } from './branded';

// ID branded types for sync-engine (value exports include type)
export {
  MutationId,
  EntityId,
  TabId,
  ProvisionalId,
} from './branded';

// Bridge branded types (centralized from foundation-bridge)
// Value exports include their types automatically
export {
  QueryId,
  WorkerId,
  SqlTableName,
  SqlIdentifier,
} from './branded';

// Query engine branded types (centralized from foundation-query-engine)
// Value exports include their types automatically
export {
  MemberRef,
  ExecutionId,
} from './branded';

// Sync-related types (type exports)
export type {
  ConflictContext,
  ConflictResult,
  MergeConfig,
  QueueStats,
  ProcessingResult,
  SyncState,
  // Network types
  NetworkStatus,
  NetworkStatusListener,
  // Cross-tab types
  CrossTabMessagePayload,
  CrossTabMessage,
  CrossTabMessageHandler,
  // Sync event types
  SyncEvent,
  SyncEventListener,
  // Query types
  OfflineQueryContext,
  // Mutation types
  OfflineMutationResult,
  // Type constraints
  ConflictResolvableData,
} from './sync';

// Sync-related const objects (value + type exports)
// These follow the const pattern: `const X = { ... } as const; type X = ...`
export {
  ConflictStrategy,
  SyncEventType,
  CrossTabMessageType,
} from './sync';

// Utility types (general-purpose type transformations)
export type {
  DeepReadonly,
  DeepPartial,
  RequireFields,
  OptionalFields,
  KeysOfType,
  Mutable,
  DeepMutable,
  NonNullableFields,
  NullableFields,
  PickByType,
  OmitByType,
  ValueOf,
  ArrayElement,
  // Entity ID types
  WithId,
  WithRequiredId,
  ExtractId,
  PartialBy,
} from './utility';

// Validation types
export type {
  ValidationSeverity,
  ValidationIssue,
  ValidationResultData,
} from './validation';
export { ValidationResult } from './validation';

// Compat types (kept for backward compatibility)
export type { SimpleValidationResult as SimpleValidationResultCompat } from './compat';

// Type guards and safe conversions
export {
  // Arrow type guards
  isArrowVector,
  isArrowTable,
  isArrowField,
  // Generic type guards
  isMap,
  isSet,
  isPlainObject,
  isObject,
  isNonEmptyString,
  // Entity ID type guards
  hasId,
  has_Id,
  hasAnyId,
  getEntityId,
  matchesEntityId,
  // Safe value conversions
  toNumber,
  toString,
  toBoolean,
  toDateIsoString,
  toDate,
  // Arrow value conversion
  ArrowTypeId,
  convertArrowValueSafe,
  convertArrowRow,
} from './type-guards';
