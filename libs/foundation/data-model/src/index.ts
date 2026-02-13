/**
 * @foundation/data-model
 *
 * Core data model library containing schemas, types, query keys, and versioning.
 * This library has no dependencies and serves as the foundation for all data structures.
 *
 * @packageDocumentation
 */

// ============================================================================
// Base Schemas (common building blocks)
// ============================================================================

export {
  BaseEntitySchema,
  TenantScopedSchema,
  SoftDeleteSchema,
  TimestampsSchema,
  PaginationParamsSchema,
  SortDirectionSchema,
  DateRangeSchema,
  ConvexIdSchema,
  PROVISIONAL_ID_PREFIX,
  isProvisionalId,
  generateProvisionalId,
} from './schemas/base.schema';

// ============================================================================
// Entity Schemas
// ============================================================================

export {
  SessionSchema,
  SessionStatusSchema,
  SessionFiltersSchema,
  SessionSummarySchema,
  SessionMetricsSchema,
  LandingPageSchema,
  ExitPageSchema,
  CreateSessionSchema,
  UpdateSessionSchema,
} from './schemas/session.schema';

export {
  EventSchema,
  EventTypeSchema,
  DeviceTypeSchema,
  BrowserInfoSchema,
  DeviceInfoSchema,
  GeoLocationSchema,
  PageContextSchema,
  UtmParamsSchema,
  CreateEventSchema,
  EventFiltersSchema,
} from './schemas/event.schema';

// ============================================================================
// Types (used by sync-engine, database, data-layer)
// ============================================================================

// Type-only exports (no runtime value)
export type {
  IdMapping,
  JsonPrimitive,
  JsonObject,
  JsonArray,
  JsonValue,
  JsonSerializable,
  Brand,
  // Simple validation result (used by bridge validation)
  SimpleValidationResult,
  // Validation result data interface (the data type for ValidationResult utilities)
  ValidationResultData,
  // Data source types (used by data-layer, sync-engine)
  DataSource,
  OfflineDataSource,
  OfflineMetadata,
  WithOfflineMetadata,
} from './types';
// Value exports (includes their associated types automatically)
// Result, Milliseconds, Timestamp, and ID constructors are both types and value constructors
export {
  isJsonSerializable,
  cloneJsonSerializable,
  toJsonSerializable,
  tryToJsonSerializable,
  assertJsonSerializable,
  JsonSerializationError,
  Result,
  Milliseconds,
  Timestamp,
  MutationId,
  EntityId,
  TabId,
  ProvisionalId,
  // Bridge branded constructors
  QueryId,
  WorkerId,
  SqlTableName,
  SqlIdentifier,
  // Query engine branded constructors
  MemberRef,
  ExecutionId,
} from './types';

// Sync-related types (used by sync-engine, data-layer)
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
} from './types';
// Sync-related const objects (value + type exports)
export {
  ConflictStrategy,
  SyncEventType,
  CrossTabMessageType,
} from './types';

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
} from './types';

// Inferred types from schemas
import type { z } from 'zod';
import type { SessionSchema as SessionSchemaType } from './schemas/session.schema';
import type { EventSchema as EventSchemaType } from './schemas/event.schema';
import type { BaseEntitySchema as BaseEntitySchemaType } from './schemas/base.schema';

export type Session = z.infer<typeof SessionSchemaType>;
export type Event = z.infer<typeof EventSchemaType>;
export type BaseEntity = z.infer<typeof BaseEntitySchemaType>;

// ============================================================================
// Query Keys (used by data-layer, sync-engine, database)
// ============================================================================

export type {
  QueryKeyBase,
  EntityQueryKeyFactory,
  AnalyticsQueryKey,
  QueryKeyMeta,
} from './query-keys';

export {
  hashQueryKey,
  createQueryKeys,
  createAnalyticsQueryKey,
  extractQueryKeyMeta,
  matchesQueryKey,
} from './query-keys';

// ============================================================================
// Versioning (used by data-layer, sync-engine)
// ============================================================================

export { SCHEMA_VERSION } from './versioning';

// ============================================================================
// Validation Types
// ============================================================================

export type {
  ValidationSeverity,
  ValidationIssue,
} from './types';
export { ValidationResult, BrandedTypeValidationError } from './types';

// ============================================================================
// Type Guards
// ============================================================================

export {
  isArrowVector,
  isArrowTable,
  isArrowField,
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
  toNumber,
  toString,
  toBoolean,
  toDateIsoString,
  toDate,
  ArrowTypeId,
  convertArrowValueSafe,
  convertArrowRow,
} from './types';

// ============================================================================
// Error Infrastructure
// ============================================================================

export {
  // Error codes
  FoundationErrorCode,
  ErrorCategory,
  getErrorCategory,
  isRetryableErrorCode,
  // Error classes
  FoundationError,
  GenericFoundationError,
  toFoundationError,
  isFoundationError,
  hasErrorCode,
  isErrorCategory,
  // Error callbacks
  createErrorInfo,
  adaptLegacyCallback,
  adaptToLegacyCallback,
  noopErrorCallback,
  createConsoleErrorCallback,
  combineErrorCallbacks,
  filterByCategory,
  filterByCode,
  // Query execution errors
  QueryTimeoutError,
  QueryCancelledError,
  QueryExecutionError,
  CANCELLATION_REASON,
} from './errors';

export type {
  SerializedError,
  ErrorContext,
  ErrorInfo,
  FoundationErrorCallback,
  LegacyErrorCallback,
  CancellationReasonKind,
} from './errors';

// ============================================================================
// HTTP Constants (shared across foundation-http, foundation-metrics)
// ============================================================================

export { HTTP_METHOD, type HttpMethod } from './http';

// ============================================================================
// Observability Constants (shared across foundation-metrics, foundation-http)
// ============================================================================

export {
  ENVIRONMENT,
  type Environment,
  COMPLIANCE_REGION,
  type ComplianceRegion,
  SEVERITY_NUMBER,
  type SeverityNumberValue,
  HASH_ALGORITHM,
  type HashAlgorithm,
} from './observability-constants';
