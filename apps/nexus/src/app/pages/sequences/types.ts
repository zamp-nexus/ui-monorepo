/**
 * What a Sequence looks like on the wire.
 *
 * Mirrors `sequence_schemas.py`. Written as the contract rather than copied
 * from the server's models, so a change there shows up here as a type error.
 */

export type RawTableKind = 'connector_source_table' | 'dataset_table_version';

export interface RawTable {
  readonly kind: RawTableKind;
  readonly label: string;
}

export type SequenceOrigin = 'manual' | 'chat';

export interface SequenceOperation {
  readonly kind: string;
  readonly parameters: Record<string, unknown>;
}

export interface SequenceListItem {
  readonly sequence_id: string;
  readonly thread_id: string | null;
  readonly origin: SequenceOrigin;
  readonly raw_table: RawTable;
  readonly step_count: number;
  readonly final_table_count: number;
  readonly failed_run_count: number;
  readonly created_at: string;
  readonly updated_at: string;
}

export interface SequenceListResponse {
  readonly dataset_workspace_id: string;
  readonly items: readonly SequenceListItem[];
}

export interface SequenceStep {
  readonly step_id: string;
  readonly operation: SequenceOperation;
  readonly input_prepared_table_id: string | null;
  readonly produced_table_id: string;
  readonly created_at: string;
}

export interface PreparedTable {
  readonly prepared_table_id: string;
  readonly step_id: string;
  readonly parent_prepared_table_id: string | null;
  readonly row_count: number;
  readonly columns: readonly string[];
  readonly created_at: string;
  readonly is_final: boolean;
}

export type SequenceFailureReason =
  | 'catalog_violation'
  | 'data_incompatible'
  | 'unknown_table'
  | 'execution_error';

export interface FailedRun {
  readonly run_id: string;
  readonly attempted_at: string;
  readonly failure_reason: SequenceFailureReason;
  readonly failure_detail: string;
  readonly anchor_prepared_table_id: string | null;
}

export interface SequenceGraph {
  readonly sequence_id: string;
  readonly dataset_workspace_id: string;
  readonly thread_id: string | null;
  readonly origin: SequenceOrigin;
  readonly raw_table: RawTable;
  readonly created_at: string;
  readonly updated_at: string;
  readonly steps: readonly SequenceStep[];
  readonly prepared_tables: readonly PreparedTable[];
  readonly failed_runs: readonly FailedRun[];
}

export interface PreparedTablePreview {
  readonly prepared_table_id: string;
  readonly step_id: string;
  readonly row_count: number;
  readonly columns: readonly string[];
  readonly is_final: boolean;
  readonly created_at: string;
  readonly produced_by: SequenceOperation;
  readonly sample_rows: null;
}

export type RawTableRequest =
  | {
      readonly kind: 'connector_source_table';
      readonly catalog_version_id: string;
      readonly source_table_name: string;
    }
  | {
      readonly kind: 'dataset_table_version';
      readonly storage_locator: string;
      readonly file_format: 'csv' | 'parquet';
    };

export interface CreateSequenceRequest {
  readonly project_id: string;
  readonly raw_table: RawTableRequest;
  readonly message: string;
}
