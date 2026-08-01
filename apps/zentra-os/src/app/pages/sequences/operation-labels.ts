/**
 * Human-readable descriptions of the closed Sequence Step operation catalog.
 *
 * Mirrors `libs/domain/sequence/src/zentra_domain_sequence/catalog.py`'s five
 * operations. A sixth operation would fail typechecking here via the
 * `Record<string, …>` lookup falling through to the `default` entry, which is
 * the intended signal that this file is out of sync with the catalog.
 */

import type { SequenceOperation } from './types';

export interface OperationField {
  readonly label: string;
  readonly value: string;
}

interface OperationDescriptor {
  readonly title: string;
  readonly describe: (parameters: Record<string, unknown>) => readonly OperationField[];
}

const asList = (value: unknown): string =>
  Array.isArray(value) && value.length > 0 ? value.join(', ') : '(all columns)';

const OPERATION_DESCRIPTORS: Record<string, OperationDescriptor> = {
  drop_nulls: {
    title: 'Drop nulls',
    describe: (parameters) => [
      { label: 'Columns', value: asList(parameters.columns) },
      { label: 'Strategy', value: String(parameters.strategy ?? 'any') },
    ],
  },
  cast_type: {
    title: 'Cast type',
    describe: (parameters) => [
      { label: 'Column', value: String(parameters.column ?? '') },
      { label: 'Target type', value: String(parameters.target_type ?? '') },
    ],
  },
  dedupe: {
    title: 'Dedupe',
    describe: (parameters) => [{ label: 'Columns', value: asList(parameters.columns) }],
  },
  filter_rows: {
    title: 'Filter rows',
    describe: (parameters) => [
      { label: 'Column', value: String(parameters.column ?? '') },
      { label: 'Operator', value: String(parameters.operator ?? '') },
      ...(parameters.value !== undefined && parameters.value !== null
        ? [{ label: 'Value', value: String(parameters.value) }]
        : []),
    ],
  },
  rename_column: {
    title: 'Rename column',
    describe: (parameters) => [
      { label: 'From', value: String(parameters.from_name ?? '') },
      { label: 'To', value: String(parameters.to_name ?? '') },
    ],
  },
};

const UNKNOWN_OPERATION: OperationDescriptor = {
  title: 'Unknown operation',
  describe: (parameters) =>
    Object.entries(parameters).map(([label, value]) => ({ label, value: String(value) })),
};

export const operationTitle = (operation: SequenceOperation): string =>
  (OPERATION_DESCRIPTORS[operation.kind] ?? UNKNOWN_OPERATION).title;

export const operationFields = (
  operation: SequenceOperation,
): readonly OperationField[] =>
  (OPERATION_DESCRIPTORS[operation.kind] ?? UNKNOWN_OPERATION).describe(operation.parameters);
