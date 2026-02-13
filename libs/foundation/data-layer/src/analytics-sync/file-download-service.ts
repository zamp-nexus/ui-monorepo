/**
 * File Download Service
 *
 * Downloads files from signed URLs using axios, with progress tracking
 * and retry logic.
 *
 * @module analytics-sync/file-download-service
 */

import axios, { type AxiosInstance, type AxiosProgressEvent } from 'axios';
import {
  OpfsFileType,
  type OpfsManager,
} from '@open-insights-web/foundation-database';
import { FoundationError, FoundationErrorCode } from '@open-insights-web/foundation-data-model';
import { createDebugLogger, Semaphore, type Logger } from '@open-insights-web/foundation-utils';
import type { DataSourceFileInfo } from './types';

/**
 * Download progress state
 */
export interface DownloadProgressState {
  readonly isDownloading: boolean;
  readonly progress: number; // 0-100
  readonly filesTotal: number;
  readonly filesCompleted: number;
  readonly currentFile: string | null;
  readonly bytesLoaded: number;
  readonly bytesTotal: number;
}

/**
 * Initial download state
 */
export const INITIAL_DOWNLOAD_STATE: DownloadProgressState = Object.freeze({
  isDownloading: false,
  progress: 0,
  filesTotal: 0,
  filesCompleted: 0,
  currentFile: null,
  bytesLoaded: 0,
  bytesTotal: 0,
});

/**
 * OPFS Manager operations subset for file downloads.
 *
 * Uses Pick from the canonical OpfsManager type in foundation-database
 * to keep the dependency surface minimal and testable.
 */
export type OpfsManagerOperations = Pick<OpfsManager, 'writeFile'>;

/**
 * Retry configuration for file downloads.
 *
 * @see DEFAULT_RETRY_CONFIG in core/constants for query/mutation retry configuration.
 */
export interface DownloadRetryConfig {
  /** Maximum retry attempts */
  readonly maxRetries: number;
  /** Initial delay in ms */
  readonly initialDelayMs: number;
  /** Maximum delay in ms */
  readonly maxDelayMs: number;
  /** Backoff multiplier */
  readonly backoffMultiplier: number;
}

/**
 * Default retry configuration for file downloads.
 *
 * Distinct from the query/mutation retry config in core/constants.ts.
 *
 * @see DEFAULT_RETRY_CONFIG in core/constants for query/mutation retry configuration.
 */
export const DEFAULT_DOWNLOAD_RETRY_CONFIG: DownloadRetryConfig = Object.freeze({
  maxRetries: 3,
  initialDelayMs: 1000,
  maxDelayMs: 30000,
  backoffMultiplier: 2,
});

/**
 * File Download Service Configuration
 */
/**
 * Default number of concurrent file downloads.
 */
const DEFAULT_DOWNLOAD_CONCURRENCY = 3;

export interface FileDownloadServiceConfig {
  /** OPFS manager for saving files */
  readonly opfsManager: OpfsManagerOperations;
  /** Retry configuration */
  readonly retry?: Partial<DownloadRetryConfig>;
  /**
   * Maximum number of concurrent file downloads.
   * Defaults to 3. Set to 1 for sequential downloads.
   */
  readonly concurrency?: number;
  /** Enable debug logging */
  readonly debug?: boolean;
  /**
   * Optional axios instance to use for downloads.
   * If not provided, uses global axios instance.
   * Can be injected from foundation-http for auth token support.
   */
  readonly axiosInstance?: AxiosInstance;
}

/**
 * Download error with context.
 *
 * Extends FoundationError for consistent error handling across foundation libraries.
 * Provides the filename and optional HTTP status code
 * for better diagnostics when file downloads fail.
 */
export class DownloadError extends FoundationError {
  readonly code = FoundationErrorCode.NETWORK_REQUEST_FAILED;
  readonly filename: string;
  readonly statusCode: number | undefined;

  constructor(message: string, filename: string, statusCode?: number, cause?: Error) {
    super(message, { source: 'data-layer', operation: 'download', filename }, cause);
    this.name = 'DownloadError';
    this.filename = filename;
    this.statusCode = statusCode;
  }
}

const toArrayBuffer = (data: ArrayBuffer | Uint8Array): ArrayBuffer => {
  if (data instanceof ArrayBuffer) {
    return data;
  }

  const { buffer, byteOffset, byteLength } = data;
  if (buffer instanceof ArrayBuffer && byteOffset === 0 && byteLength === buffer.byteLength) {
    return buffer;
  }

  const copy = new Uint8Array(byteLength);
  copy.set(new Uint8Array(buffer, byteOffset, byteLength));
  return copy.buffer;
};

/**
 * File Download Service
 *
 * Downloads parquet files with progress tracking and retry logic.
 */
export class FileDownloadService {
  private readonly opfsManager: OpfsManagerOperations;
  private readonly retryConfig: DownloadRetryConfig;
  private readonly concurrency: number;
  private readonly axiosInstance: AxiosInstance;
  private readonly logger: Logger;

  constructor(config: FileDownloadServiceConfig) {
    this.opfsManager = config.opfsManager;
    this.retryConfig = {
      ...DEFAULT_DOWNLOAD_RETRY_CONFIG,
      ...config.retry,
    };
    this.concurrency = config.concurrency ?? DEFAULT_DOWNLOAD_CONCURRENCY;
    this.axiosInstance = config.axiosInstance ?? axios;
    this.logger = createDebugLogger('FileDownloadService', config.debug ?? false);
  }

  /**
   * Sleep for a duration
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Calculate backoff delay for retry
   */
  private getRetryDelay(attempt: number): number {
    const delay = this.retryConfig.initialDelayMs * Math.pow(this.retryConfig.backoffMultiplier, attempt);
    return Math.min(delay, this.retryConfig.maxDelayMs);
  }

  /**
   * Download a single file with progress tracking using axios
   */
  async downloadFile(
    file: DataSourceFileInfo,
    onProgress?: (bytesLoaded: number, totalBytes: number) => void
  ): Promise<ArrayBuffer> {
    this.logger.debug(`Downloading file: ${file.filename} (${file.size} bytes)`);

    try {
      const response = await this.axiosInstance.get<ArrayBuffer>(file.url, {
        responseType: 'arraybuffer',
        onDownloadProgress: (progressEvent: AxiosProgressEvent) => {
          const loaded = progressEvent.loaded ?? 0;
          const total = progressEvent.total ?? file.size;
          onProgress?.(loaded, total);
        },
      });

      const normalizedData = toArrayBuffer(response.data as ArrayBuffer | Uint8Array);
      this.logger.debug(`Downloaded file: ${file.filename} (${normalizedData.byteLength} bytes)`);
      return normalizedData;
    } catch (err: unknown) {
      if (err && typeof err === 'object' && 'response' in err) {
        const res = (err as { response?: { status?: number; statusText?: string } }).response;
        throw new DownloadError(
          `Download failed: HTTP ${res?.status ?? ''} ${res?.statusText ?? ''}`.trim(),
          file.filename,
          res?.status,
          err instanceof Error ? err : new Error(String(err))
        );
      }
      throw new DownloadError(
        err instanceof Error ? err.message : 'Download failed',
        file.filename,
        undefined,
        err instanceof Error ? err : new Error(String(err))
      );
    }
  }

  /**
   * Download a single file with retry logic
   */
  async downloadFileWithRetry(
    file: DataSourceFileInfo,
    onProgress?: (bytesLoaded: number, totalBytes: number) => void
  ): Promise<ArrayBuffer> {
    let lastError: Error | undefined;

    for (let attempt = 0; attempt <= this.retryConfig.maxRetries; attempt++) {
      try {
        return await this.downloadFile(file, onProgress);
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        if (error instanceof DownloadError) {
          const status = error.statusCode;
          if (status && status >= 400 && status < 500 && status !== 429) {
            throw error;
          }
        }

        if (attempt < this.retryConfig.maxRetries) {
          const delay = this.getRetryDelay(attempt);
          this.logger.debug(
            `Download failed for ${file.filename}, retrying in ${delay}ms (attempt ${attempt + 1}/${this.retryConfig.maxRetries}):`,
            lastError.message
          );
          await this.sleep(delay);
        }
      }
    }

    throw new DownloadError(
      `Download failed after ${this.retryConfig.maxRetries + 1} attempts: ${lastError?.message}`,
      file.filename,
      undefined,
      lastError
    );
  }

  /**
   * Download and save multiple files for a table
   */
  async downloadAndSaveFiles(
    tableName: string,
    files: ReadonlyArray<DataSourceFileInfo>,
    onProgress?: (state: DownloadProgressState) => void
  ): Promise<void> {
    const total = files.length;
    const totalBytes = files.reduce((sum, file) => sum + file.size, 0);

    if (total === 0) {
      this.logger.debug(`No files to download for table ${tableName}`);
      return;
    }

    this.logger.debug(`Downloading ${total} files for table ${tableName} (concurrency: ${this.concurrency})`);

    let filesCompleted = 0;
    let totalBytesLoaded = 0;

    const semaphore = new Semaphore(this.concurrency);

    const downloadTasks = files.map((file) => async () => {
      const release = await semaphore.acquire();
      try {
        onProgress?.({
          isDownloading: true,
          progress: (filesCompleted / total) * 100,
          filesTotal: total,
          filesCompleted,
          currentFile: file.filename,
          bytesLoaded: totalBytesLoaded,
          bytesTotal: totalBytes,
        });

        const data = await this.downloadFileWithRetry(file, (bytesLoaded) => {
          onProgress?.({
            isDownloading: true,
            progress: ((filesCompleted + bytesLoaded / file.size) / total) * 100,
            filesTotal: total,
            filesCompleted,
            currentFile: file.filename,
            bytesLoaded: totalBytesLoaded + bytesLoaded,
            bytesTotal: totalBytes,
          });
        });

        // OPFS writes must be sequential to avoid file handle conflicts
        await this.opfsManager.writeFile(`${tableName}.parquet`, data, {
          tableName,
          fileType: OpfsFileType.PARQUET,
          rowCount: file.rowCount,
        });

        filesCompleted++;
        totalBytesLoaded += file.size;
        this.logger.debug(`Saved file ${filesCompleted}/${total}: ${file.filename}`);
      } finally {
        release();
      }
    });

    // Execute downloads with concurrency control
    await Promise.all(downloadTasks.map((task) => task()));

    onProgress?.({
      isDownloading: false,
      progress: 100,
      filesTotal: total,
      filesCompleted: total,
      currentFile: null,
      bytesLoaded: totalBytesLoaded,
      bytesTotal: totalBytes,
    });

    this.logger.debug(`Completed downloading ${total} files for table ${tableName}`);
  }
}

