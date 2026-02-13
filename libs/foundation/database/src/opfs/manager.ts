/**
 * OPFS (Origin Private File System) Manager
 *
 * Manages files in Origin Private File System with quota handling,
 * proper error types, and metadata tracking.
 *
 * @module opfs/manager
 */

import isEqual from 'fast-deep-equal';
import type { LegacyErrorCallback } from '@open-insights-web/foundation-data-model';
import type { InsightsDatabase } from '../core/database';
import { getDatabase } from '../core/database';
import {
  createOpfsMetadata,
  sortByDependencies,
  OpfsFileType,
  type OpfsMetadataEntry,
  type OpfsFileSchema,
} from '../tables/opfs-metadata';
import {
  createOpfsNotSupportedError,
  createOpfsInitFailedError,
  createQuotaExceededError,
  createValidationError,
  isQuotaExceededError,
} from '../errors';
import {
  createDebugLogger,
  getErrorMessage,
  normalizeError,
  createSingletonFactory,
  createDeepEqualComparison,
  isOpfsSupported,
  getOpfsRootDirectory,
  type Logger,
} from '@open-insights-web/foundation-utils';

/**
 * Default error handler that logs to console.error
 */
const defaultErrorHandler: LegacyErrorCallback = (error: Error, context?: string): void => {
  console.error(`[OpfsManager] Error in ${context ?? 'unknown'}:`, error.message);
};

// Note: Type augmentation for FileSystemDirectoryHandle is now in foundation-utils/opfs

/**
 * OPFS Manager configuration
 */
export interface OpfsManagerConfig {
  /** Database instance */
  database?: InsightsDatabase;
  /** Root directory name in OPFS */
  rootDir?: string;
  /** Enable debug logging */
  debug?: boolean;
  /** Custom error handler for non-fatal errors */
  onError?: LegacyErrorCallback;
}

/**
 * Default OPFS manager configuration
 */
const DEFAULT_CONFIG: Required<Omit<OpfsManagerConfig, 'database' | 'onError'>> = {
  rootDir: 'open-insights',
  debug: false,
};

/**
 * File write options
 */
export interface WriteFileOptions {
  tableName: string;
  fileType: OpfsFileType;
  contentHash?: string;
  rowCount?: number;
  schema?: OpfsFileSchema;
  viewName?: string;
  dependencies?: string[];
}

/**
 * OPFS Manager for managing files in Origin Private File System
 */
export class OpfsManager {
  private db: InsightsDatabase;
  private config: Required<Omit<OpfsManagerConfig, 'database' | 'onError'>>;
  private rootHandle: FileSystemDirectoryHandle | null = null;
  private initialized = false;
  private onError: LegacyErrorCallback;
  private logger: Logger;

  constructor(config: OpfsManagerConfig = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.db = config.database ?? getDatabase();
    // Use provided error handler or fall back to default
    this.onError = config.onError ?? defaultErrorHandler;
    // Use foundation/utils logger
    this.logger = createDebugLogger('OpfsManager', this.config.debug);
  }

  /**
   * Log helper using foundation/utils logger
   */
  private log = (...args: unknown[]): void => {
    this.logger.debug(...args);
  };

  /**
   * Handle non-fatal errors using configured handler
   */
  private handleNonFatalError = (error: unknown, context: string): void => {
    const err = normalizeError(error);
    this.onError(err, context);
  };

  /**
   * Check if OPFS is supported in this environment
   */
  static isSupported = (): boolean => {
    return isOpfsSupported();
  };

  /**
   * Check if manager is initialized
   */
  get isInitialized(): boolean {
    return this.initialized;
  }

  /**
   * Initialize the OPFS manager
   */
  initialize = async (): Promise<void> => {
    // Early return if already initialized
    if (this.initialized) return;

    // Check support with typed error
    if (!OpfsManager.isSupported()) {
      throw createOpfsNotSupportedError();
    }

    try {
      const root = await getOpfsRootDirectory();
      this.rootHandle = await root.getDirectoryHandle(this.config.rootDir, {
        create: true,
      });
      this.initialized = true;
      this.log('Initialized with root:', this.config.rootDir);
    } catch (error) {
      throw createOpfsInitFailedError(getErrorMessage(error));
    }
  };

  /**
   * Ensure manager is initialized
   * Fixed: No non-null assertion, explicit null check
   */
  private ensureInitialized = async (): Promise<FileSystemDirectoryHandle> => {
    if (!this.initialized || !this.rootHandle) {
      await this.initialize();
    }

    // Explicit null check instead of assertion
    if (!this.rootHandle) {
      throw createOpfsInitFailedError('Root handle is null after initialization');
    }

    return this.rootHandle;
  };

  /**
   * Get or create a subdirectory
   */
  private getDirectory = async (
    path: string
  ): Promise<FileSystemDirectoryHandle> => {
    const root = await this.ensureInitialized();
    const parts = path.split('/').filter(Boolean);

    let current = root;
    for (const part of parts) {
      current = await current.getDirectoryHandle(part, { create: true });
    }

    return current;
  };

  /**
   * Parse a file path into directory path and file name
   * Validates that path is not empty and contains a filename
   */
  private parsePath = (path: string): { dirPath: string; fileName: string } => {
    if (!path || path.trim() === '') {
      throw createValidationError('path', 'Path cannot be empty');
    }

    const pathParts = path.split('/').filter(Boolean);
    if (pathParts.length === 0) {
      throw createValidationError('path', 'Path must contain a filename');
    }

    const fileName = pathParts.pop() as string; // Safe after length check
    const dirPath = pathParts.join('/');

    return { dirPath, fileName };
  };

  /**
   * Write a file to OPFS
   * Includes quota handling
   */
  writeFile = async (
    path: string,
    data: ArrayBuffer | Uint8Array | string,
    options: WriteFileOptions
  ): Promise<OpfsMetadataEntry> => {
    const root = await this.ensureInitialized();

    // Parse and validate path
    const { dirPath, fileName } = this.parsePath(path);

    // Get directory handle
    const dirHandle = dirPath ? await this.getDirectory(dirPath) : root;

    // Create file
    const fileHandle = await dirHandle.getFileHandle(fileName, { create: true });
    const writable = await fileHandle.createWritable();

    // Convert data to Uint8Array for consistent handling and size calculation
    let bytes: Uint8Array;
    if (typeof data === 'string') {
      bytes = new TextEncoder().encode(data);
    } else if (data instanceof ArrayBuffer) {
      bytes = new Uint8Array(data);
    } else {
      bytes = data;
    }
    
    // Create a fresh ArrayBuffer copy to ensure it's not a SharedArrayBuffer
    const buffer = new ArrayBuffer(bytes.byteLength);
    new Uint8Array(buffer).set(bytes);

    // Write with quota handling
    try {
      // Create Blob from ArrayBuffer for proper type safety with FileSystemWriteChunkType
      await writable.write(new Blob([buffer]));
      await writable.close();
    } catch (error) {
      // Close writable on error, log any close errors
      try {
        await writable.close();
      } catch (closeError) {
        // Log close error instead of silently ignoring
        this.handleNonFatalError(closeError, 'writeFile.close');
      }

      // Handle quota exceeded
      if (isQuotaExceededError(error)) {
        throw createQuotaExceededError(buffer.byteLength);
      }
      throw error;
    }

    // Create and store metadata
    const metadata = createOpfsMetadata(path, {
      ...options,
      sizeBytes: buffer.byteLength,
    });

    await this.db.opfsFiles.put(metadata);
    this.log('Wrote file:', path, metadata);

    return metadata;
  };

  /**
   * Read a file from OPFS
   */
  readFile = async (path: string): Promise<ArrayBuffer> => {
    const root = await this.ensureInitialized();

    // Parse and validate path
    const { dirPath, fileName } = this.parsePath(path);

    const dirHandle = dirPath ? await this.getDirectory(dirPath) : root;

    const fileHandle = await dirHandle.getFileHandle(fileName);
    const file = await fileHandle.getFile();
    return file.arrayBuffer();
  };

  /**
   * Read a file as text
   */
  readFileAsText = async (path: string): Promise<string> => {
    const buffer = await this.readFile(path);
    return new TextDecoder().decode(buffer);
  };

  /**
   * Check if a file exists
   */
  exists = async (path: string): Promise<boolean> => {
    try {
      const root = await this.ensureInitialized();

      // Parse and validate path
      const { dirPath, fileName } = this.parsePath(path);

      const dirHandle = dirPath ? await this.getDirectory(dirPath) : root;

      await dirHandle.getFileHandle(fileName);
      return true;
    } catch (error) {
      // NotFoundError is expected when file doesn't exist
      if (error instanceof DOMException && error.name === 'NotFoundError') {
        return false;
      }
      // Log unexpected errors but still return false
      this.handleNonFatalError(error, 'exists');
      return false;
    }
  };

  /**
   * Delete a file
   */
  deleteFile = async (path: string): Promise<void> => {
    const root = await this.ensureInitialized();

    // Parse and validate path
    const { dirPath, fileName } = this.parsePath(path);

    const dirHandle = dirPath ? await this.getDirectory(dirPath) : root;

    await dirHandle.removeEntry(fileName);
    await this.db.opfsFiles.delete(path);

    this.log('Deleted file:', path);
  };

  /**
   * Get file metadata from database
   */
  getMetadata = async (path: string): Promise<OpfsMetadataEntry | undefined> => {
    return this.db.opfsFiles.get(path);
  };

  /**
   * Get all files for a table
   */
  getFilesByTable = async (tableName: string): Promise<OpfsMetadataEntry[]> => {
    return this.db.opfsFiles.where('tableName').equals(tableName).toArray();
  };

  /**
   * Get all registered files in dependency order
   */
  getRegisteredFilesInOrder = async (): Promise<OpfsMetadataEntry[]> => {
    const files = await this.db.opfsFiles
      .filter((f) => f.isRegistered)
      .toArray();

    return sortByDependencies(files);
  };

  /**
   * Get all view definitions
   */
  getViewDefinitions = async (): Promise<OpfsMetadataEntry[]> => {
    return this.db.opfsFiles
      .filter((f) => f.fileType === OpfsFileType.VIEW_DEFINITION)
      .toArray();
  };

  /**
   * Mark file as registered in DuckDB
   */
  markRegistered = async (path: string): Promise<void> => {
    await this.db.opfsFiles.update(path, { isRegistered: true });
    this.log('Marked registered:', path);
  };

  /**
   * Mark file as unregistered from DuckDB
   */
  markUnregistered = async (path: string): Promise<void> => {
    await this.db.opfsFiles.update(path, { isRegistered: false });
    this.log('Marked unregistered:', path);
  };

  /**
   * Mark all files as unregistered (e.g., after DuckDB restart)
   */
  markAllUnregistered = async (): Promise<void> => {
    await this.db.opfsFiles.toCollection().modify({ isRegistered: false });
    this.log('Marked all files unregistered');
  };

  /**
   * Get total size of all files
   * Optimized: uses each() to avoid loading all records into memory
   */
  getTotalSize = async (): Promise<number> => {
    let total = 0;
    await this.db.opfsFiles.each((file) => {
      total += file.sizeBytes;
    });
    return total;
  };

  /**
   * List all files in a directory
   */
  listDirectory = async (dirPath?: string): Promise<string[]> => {
    const root = await this.ensureInitialized();
    const dirHandle = dirPath ? await this.getDirectory(dirPath) : root;

    const entries: string[] = [];
    // Use entries() method for proper type safety
    for await (const [name] of dirHandle.entries()) {
      entries.push(dirPath ? `${dirPath}/${name}` : name);
    }

    return entries;
  };

  /**
   * Clear all files and metadata
   */
  clear = async (): Promise<void> => {
    const root = await this.ensureInitialized();

    // Remove all entries in root using entries() method for proper type safety
    for await (const [name] of root.entries()) {
      await root.removeEntry(name, { recursive: true });
    }

    // Clear metadata
    await this.db.opfsFiles.clear();

    this.log('Cleared all files');
  };

  /**
   * Dispose the manager (release resources)
   */
  dispose = async (): Promise<void> => {
    this.rootHandle = null;
    this.initialized = false;
    this.log('Disposed');
  };
}

// =============================================================================
// Singleton Management using createSingletonFactory
// =============================================================================

/**
 * Singleton factory for OpfsManager
 */
const opfsManagerFactory = createSingletonFactory(
  (config: OpfsManagerConfig | undefined) => new OpfsManager(config),
  {
    name: 'OpfsManager',
    compareConfig: createDeepEqualComparison(isEqual, 'OpfsManager'),
    onDispose: async (instance) => {
      await (instance as OpfsManager).dispose();
    },
  }
);

/**
 * Get or create OPFS manager instance
 */
export const getOpfsManager = (config?: OpfsManagerConfig): OpfsManager => {
  return opfsManagerFactory.getInstance(config);
};

/**
 * Reset OPFS manager instance
 */
export const resetOpfsManager = async (): Promise<void> => {
  await opfsManagerFactory.reset();
};

/**
 * Check if OPFS manager instance exists
 */
export const hasOpfsManager = (): boolean => {
  return opfsManagerFactory.hasInstance();
};
