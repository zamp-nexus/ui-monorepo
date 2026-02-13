/**
 * Foundation Query Engine
 *
 * Pure orchestration layer for query definition, building, compilation, and routing.
 * Delegates ALL execution to foundation-data-layer hooks.
 *
 * ARCHITECTURE:
 * - Query Types: Defines Query object structure (dimensions, measures, filters, joins)
 * - Query Builder: Fluent API for constructing queries
 * - SQL Compiler: Compiles Query objects to DuckDB SQL
 * - Decision Engine: Routes queries to API or DuckDB path
 * - Table Extractor: Extracts table names from query members
 * - React Hooks: useDLQueryEngine and useDLMutateQueryEngine
 *
 * ALLOWED DEPENDENCIES:
 * - foundation-data-layer (hooks and utilities)
 * - foundation-data-model (types only)
 * - foundation-bridge (shared SQL utilities)
 * - foundation-utils (utilities)
 *
 * FORBIDDEN DEPENDENCIES (do NOT import directly):
 * - foundation-database
 * - foundation-sync-engine
 *
 * IMPORTANT — import these directly, they are NOT re-exported here:
 * - Branded types (SqlTableName, MemberRef, QueryId, etc.) → foundation-data-model
 * - Utility types (DeepReadonly, DeepPartial) → foundation-data-model
 * - JSON types (JsonValue, JsonObject) → foundation-data-model
 * - ConflictStrategy → foundation-data-model
 * - EMPTY_ARRAY, EMPTY_OBJECT → foundation-utils
 *
 * @packageDocumentation
 */

// =============================================================================
// TYPES (Core type definitions)
// =============================================================================

export {
  // Filter value type (query-engine owned)
  type FilterValue,

  // Operations types
  OPERATIONS,
  READ_OPERATIONS,
  WRITE_OPERATIONS,
  type Operation,
  type ReadOperation,
  type WriteOperation,
  isOperation,
  isReadOperation,
  isWriteOperation,
  isMutationOperation,

  // Dimension types
  DIMENSION_FORMAT_TYPES,
  type DimensionFormatType,
  type DimensionSpec,
  isDimensionSpec,
  extractTableFromDimension,
  extractColumnFromDimension,
  getDimensionAlias,
  createDimension,

  // Aggregation types
  AGGREGATIONS,
  COUNT_AGGREGATIONS,
  NUMERIC_AGGREGATIONS,
  DISTINCT_AGGREGATIONS,
  type Aggregation,
  type CountAggregation,
  type NumericAggregation,
  type DistinctAggregation,
  isAggregation,
  isCountAggregation,
  isNumericAggregation,
  isDistinctAggregation,
  getAggregationSqlFunction,

  // Measure types
  MEASURE_FORMAT_TYPES,
  type MeasureFormatType,
  type MeasureSpec,
  isMeasureSpec,
  extractTableFromMeasure,
  extractColumnFromMeasure,
  getMeasureAlias,
  measureUsesDistinct,
  createMeasure,
  sumMeasure,
  countMeasure,
  countDistinctMeasure,
  avgMeasure,
  minMeasure,
  maxMeasure,

  // Filter types
  EQUALITY_OPERATORS,
  COMPARISON_OPERATORS,
  STRING_OPERATORS,
  SET_OPERATORS,
  NULL_OPERATORS,
  ARRAY_OPERATORS,
  FILTER_OPERATORS,
  VALUELESS_FILTER_OPERATORS,
  SINGLE_VALUE_FILTER_OPERATORS,
  MULTI_VALUE_FILTER_OPERATORS,
  type EqualityOperator,
  type ComparisonOperator,
  type StringOperator,
  type SetOperator,
  type NullOperator,
  type ArrayOperator,
  type FilterOperator,
  type FilterPrimitive,
  type FilterCondition,
  type FilterAndGroup,
  type FilterOrGroup,
  type FilterGroup,
  type FilterExpression,
  isFilterOperator,
  isFilterCondition,
  isFilterAndGroup,
  isFilterOrGroup,
  isFilterGroup,
  isFilterExpression,
  operatorRequiresValues,
  operatorAcceptsMultipleValues,
  extractTableFromFilter,
  extractColumnFromFilter,
  createFilterCondition,
  andFilter,
  orFilter,
  eq,
  neq,
  gt,
  gte,
  lt,
  lte,
  between,
  inList,
  notInList,
  contains,
  startsWith,
  endsWith,
  isNull,
  isNotNull,

  // Join types
  JOIN_TYPES,
  type JoinType,
  type JoinSpec,
  isJoinType,
  isJoinSpec,
  extractLeftTable,
  extractRightTable,
  extractLeftColumn,
  extractRightColumn,
  extractTablesFromJoin,
  getJoinSqlKeyword,
  createJoin,
  innerJoin,
  leftJoin,
  rightJoin,
  fullJoin,

  // Order types
  ORDER_DIRECTIONS,
  NULLS_HANDLING,
  type OrderDirection,
  type NullsHandling,
  type OrderBySpec,
  isOrderDirection,
  isOrderBySpec,
  extractTableFromOrderBy,
  extractColumnFromOrderBy,
  createOrderBy,
  asc,
  desc,

  // Query types
  QUERY_BACKENDS,
  QUERY_DATA_SOURCES,
  FRESHNESS_REQUIREMENTS,
  type QueryBackend,
  type DataSource,
  type FreshnessRequirement,
  type Query,
  type QueryValidationResult,
  type QueryValidationError,
  type QueryValidationWarning,
  isQuery,
  queryRequiresDuckDB,
  isMutationQuery,
  isReadQuery,
  isQueryBackend,
  isFreshnessRequirement,
  getQueryOperation,
  createListQuery,
  createGetQuery,
  createCountQuery,

  // Table types
  // NOTE: For ConflictStrategy type, import directly from @open-insights-web/foundation-data-model
  TABLE_SOURCES,
  TABLE_LOAD_STATES,
  TABLE_FILE_TYPES,
  ANALYTICS_FRESHNESS_LEVELS,
  type TableSource,
  type TableLoadState,
  type TableFileType,
  type AnalyticsFreshness,
  type TableConvexFunctions,
  type ParquetFileInfo,
  type TableConfig,
  type RegisterTableOptions,
  isTableSource,
  isTableLoadState,
  isConflictStrategy,
  isTableReady,
  tableNeedsLoading,
  isTableLoading,
  hasTableError,
  isTableStale,
  hasNewerServerData,
  tableHasListApi,
  tableHasMutationApi,

  // DataSource types
  type DataSourceFileInfo,
  type DataSourceTableInfo,
  type DataSourceResponse,
  type DataSourceMetadata,
  type DataSourceRequest,
  isDataSourceFileInfo,
  isDataSourceTableInfo,
  isDataSourceResponse,
  calculateTableSize,
  calculateTotalRows,
  calculateTotalSize,
  getTablesNeedingUpdate,
  hasExpiredUrls,

  // Decision types
  DECISION_PATHS,
  DECISION_REASONS,
  type ExecutionPath,
  type DecisionReason,
  type DecisionResult,
  type DecisionFactors,
  type DecisionTableConfig,
  type DecisionContext,
  type DecisionOptions,
  isExecutionPath,
  isApiPath,
  isDuckDBPath,

  // Config types
  DEFAULT_STALE_TIME,
  DEFAULT_CONFIG,
  type QueryEngineConfig,
  type ResolvedQueryEngineConfig,
  resolveQueryEngineConfig,

  // Time types
  TIME_GRANULARITIES,
  TIME_UNITS,
  PRESET_DATE_RANGES,
  GRANULARITY_MS,
  GRANULARITY_ORDER,
  type TimeGranularity,
  type TimeUnit,
  type PresetDateRange,
  type DateRange,
  type RelativeDateRange,
  type DateRangeSpec,
  type TimeDimensionSpec,
  isPresetDateRange,
  isDateRange,
  isDateRangeTuple,
  isRelativeDateRange,
  isTimeGranularity,
  isTimeUnit,
  compareGranularities,
  isGranularityFiner,
  getDateTruncUnit,
  resolvePresetDateRange,

  // Schema types
  MEASURE_DATA_TYPES,
  DIMENSION_TYPES,
  MEMBER_VISIBILITY,
  RELATIONSHIP_CARDINALITIES,
  JOIN_DEFINITION_TYPES,
  JOIN_RELATIONSHIP_CARDINALITIES,
  type MeasureDataType,
  type DimensionType,
  type MemberVisibility,
  type RelationshipCardinality,
  type JoinDefinitionType,
  type JoinRelationshipCardinality,
  type ColumnDefinition,
  type DimensionDefinition,
  type TimeDimensionDefinition,
  type MeasureDefinition,
  type RelationshipDefinition,
  type PreAggregationDefinition,
  type TableDefinition,
  type SchemaDefinition,
  isDimensionType,
  isTimeDimension,
  isMemberVisibility,
  getTableMeasures,
  getTableDimensions,
  getVisibleMembers,
  createMemberRef,

  // Result types
  EXECUTION_STATUS,
  type ExecutionStatus,
  type ResultRow,
  type ResultColumn,
  type QueryResult,
  type ExecutionTiming,
  type ExecutionMetadata,
  type ExecutionError,
  type ExecutionResult,
  type AggregationResult,
  isExecutionStatus,
  isSuccessfulExecution,
  isFailedExecution,
  createEmptyResult,
  createExecutionMetadata,
  completeExecution,
  transformResult,
  paginateResult,
} from './types';

// =============================================================================
// SCHEMA (Schema Registry and Builders)
// =============================================================================

export {
  // Registry
  SchemaRegistry,
  createSchemaRegistry,
  MEMBER_TYPES,
  type MemberType,
  type MemberResolution,
  type SchemaValidationStatus,
  SchemaNotFoundError,
  SchemaValidationError,

  // Builders
  MeasureBuilder,
  DimensionBuilder,
  TimeDimensionBuilder,
  TableBuilder,
  SchemaBuilder,
  measure,
  dimension,
  timeDimension,
  table,
  schema,
  count,
  countDistinct,
  sum,
  avg,
  min,
  max,

  // Validator
  type ValidationError,
  type DetailedValidationResult,
  validateSchema,
  validateTableDefinition,
  validateQuery,
  isValidQuery,
  isValidSchema,
  formatValidationErrors,
} from './schema';

// =============================================================================
// COMPILER (SQL Compiler + shared bridge-backed SQL utilities)
// =============================================================================

export {
  // Compiler
  SqlCompiler,
  QueryCompilationError,
  createSqlCompiler,
  // Singleton factory
  getSqlCompiler,
  resetSqlCompiler,
  hasSqlCompilerInstance,
  type SqlCompilerConfig,
  type CompilationResult,
  type CompileOptions,

  // SQL Utilities (query-engine wrappers around shared bridge helpers)
  escapeString,
  isValidIdentifier,
  quoteIdentifier,
  quoteTableName,
  quoteColumn,
  quoteMemberRef,
  formatValue,
  formatValueList,
  escapeLikePattern,
  buildContainsPattern,
  buildStartsWithPattern,
  buildEndsWithPattern,
  formatSql,
  formatDate,
  formatTimestamp,
  buildDateTrunc,
  buildAggregation,
  buildCaseExpression,
  sanitizeIdentifier,
} from './compiler';

// =============================================================================
// BUILDER (Query Builder)
// =============================================================================

export {
  // Builder
  QueryBuilder,
  createQueryBuilder,
  filterCondition,

  // Presets
  type PresetOptions,
  type TimeSeriesPresetOptions,
  countQuery,
  countByDimension,
  sumByDimension,
  timeSeriesCount,
  timeSeriesSum,
  timeSeriesMetrics,
  kpiQuery,
  comparisonKpiQuery,
  topNQuery,
  filteredCount,
  filteredAggregation,
  realtimeQuery,
  extendPreset,
} from './builder';

// =============================================================================
// ENGINE (Orchestration Components - NO execution)
// =============================================================================

export {
  // Table Extractor
  TableExtractor,
  createTableExtractor,
  getTableExtractor,
  resetTableExtractor,
  extractTables,
  getPrimaryTable,
  type TableExtractionResult,

  // Decision Engine
  DecisionEngine,
  createDecisionEngine,
  getDecisionEngine,
  resetDecisionEngine,
  hasDecisionEngineInstance,
  type DecisionEngineConfig,

  // Filter Converter (converts Query filters to data-layer args)
  convertFiltersToArgs,
  hasComplexFilters,
  countConvertibleFilters,
  type ConvertedArgs,
} from './engine';

// Member reference utilities
export {
  parseMemberRef,
  extractTableName as extractTableFromMember,
  extractColumnName as extractColumnFromMember,
  type ParsedMemberRef,
} from './utils/member-ref';

// =============================================================================
// HOOKS (React Integration - delegates to data-layer)
// =============================================================================

export {
  // Main unified hooks (use these!)
  useDLQueryEngine,
  useDLMutateQueryEngine,

  // Background file sync hook
  useBackgroundFileSync,

  // Hook types
  type UseDLQueryEngineOptions,
  type UseDLQueryEngineResult,
  type UseDLMutateQueryEngineOptions,
  type UseDLMutateQueryEngineResult,
  type UseBackgroundFileSyncOptions,
  type UseBackgroundFileSyncResult,
  type BackgroundSyncState,

  // Supporting types
  type DownloadProgress as HookDownloadProgress,
  type MutationOperation,
  type ExecutionPath as HookExecutionPath,
  type DataSource as HookDataSource,

  // Constants
  EXECUTION_PATHS as HOOK_EXECUTION_PATHS,
  DATA_SOURCES as HOOK_DATA_SOURCES,
  MUTATION_OPERATIONS,

  // Type guards
  isAnalyticsResult,
  isTransactionalResult,
  isPendingResult,
  isMutationOperation as isHookMutationOperation,
} from './hooks';

// NOTE: The following have been REMOVED from query-engine:
//
// DELETED (use foundation-data-layer instead):
// - FileManager, createFileManager (use useLoadParquetFile, useCopyToParquet)
// - DuckDBExecutor, createDuckDBExecutor (use useDLAnalytics)
// - ApiExecutor, createApiExecutor (use useDLGetList)
// - ApiParamsConverter (use convertFiltersToArgs)
//
// For optimistic updates and query keys, import from foundation-data-layer:
// - optimisticAddToList, optimisticRemoveFromList, optimisticUpdateInList
// - buildQueryKey, createAnalyticsQueryKey
// =============================================================================
