/**
 * Test Builders
 *
 * Provides builder patterns and factory functions for creating test data.
 *
 * @module builders
 */

// Query Builder
export {
  QueryBuilder,
  quickQuery,
  type TestQuery,
  type TestMeasure,
  type TestDimension,
  type TestTimeDimension,
  type TestFilter,
  type TestSort,
  type AggregationType,
  type SortDirection,
  type FilterOperator,
  type TimeGranularity,
} from './query-builder';

// Mutation Builder
export {
  MutationBuilder,
  quickMutation,
  MutationType,
  MutationStatus,
  type TestMutation,
  type MutationMeta,
} from './mutation-builder';

// Test Data
export {
  TestData,
  // Random generators
  randomString,
  randomInt,
  randomFloat,
  randomBoolean,
  randomElement,
  randomElements,
  randomEmail,
  randomUrl,
  randomTimestamp,
  randomDuration,
  // Entity generators
  generateUser,
  generateUsers,
  generateEvent,
  generateEvents,
  generateSession,
  generateSessions,
  TEST_EVENT_TYPES,
  type TestUser,
  type TestEvent,
  type TestSession,
} from './test-data';
