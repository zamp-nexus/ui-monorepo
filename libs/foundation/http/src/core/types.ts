/**
 * HTTP Client Types
 *
 * Core type definitions for the foundation-http library.
 *
 * @module core/types
 */

import type { AxiosInstance } from 'axios';

// Re-export HttpMethod from data-model for convenience within this library
export type { HttpMethod } from '@open-insights-web/foundation-data-model';

/**
 * HTTP retry configuration
 *
 * Named HttpRetryConfig to avoid collision with foundation-utils RetryConfig.
 */
export interface HttpRetryConfig {
  /** Whether retry is enabled */
  readonly enabled: boolean;
  /** Maximum number of retry attempts */
  readonly maxRetries: number;
  /** Initial delay in milliseconds */
  readonly initialDelayMs: number;
  /** Maximum delay in milliseconds */
  readonly maxDelayMs: number;
  /** Backoff multiplier for exponential backoff */
  readonly backoffMultiplier: number;
  /** HTTP status codes that should trigger a retry */
  readonly retryableStatusCodes: readonly number[];
  /** Whether to retry on network errors */
  readonly retryOnNetworkError: boolean;
}

/**
 * Authentication configuration for HTTP client
 */
export interface AuthConfig {
  /** Whether auth is enabled */
  readonly enabled: boolean;
  /** Function to get the access token */
  readonly getAccessToken?: () => Promise<string | null>;
  /** Callback when a 401/403 response is received */
  readonly onUnauthorized?: (statusCode: number, url?: string) => void;
  /** Token type for Authorization header (default: 'Bearer') */
  readonly tokenType?: string;
}

/**
 * Client identification headers configuration
 */
export interface ClientHeadersConfig {
  /** Client ID header value */
  readonly clientId?: string;
  /** Client version header value */
  readonly clientVersion?: string;
  /** Platform identifier */
  readonly platform?: string;
  /** Session ID (can be static or dynamic) */
  readonly sessionId?: string | (() => string);
}

/**
 * HTTP client configuration
 */
export interface HttpClientConfig {
  /** Base URL for all requests */
  readonly baseUrl: string;
  /** Request timeout in milliseconds */
  readonly timeout?: number;
  /** Whether to send credentials (cookies) with requests */
  readonly withCredentials?: boolean;
  /** Default headers for all requests */
  readonly defaultHeaders?: Readonly<Record<string, string>>;
  /** Client identification headers */
  readonly clientHeaders?: ClientHeadersConfig;
  /** Retry configuration */
  readonly retry?: Partial<HttpRetryConfig>;
  /** Auth configuration */
  readonly auth?: Partial<AuthConfig>;
  /** Enable debug logging */
  readonly debug?: boolean;
}

/**
 * Fully resolved HTTP client configuration with all defaults applied
 */
export interface ResolvedHttpConfig {
  readonly baseUrl: string;
  readonly timeout: number;
  readonly withCredentials: boolean;
  readonly defaultHeaders: Readonly<Record<string, string>>;
  readonly retry: Readonly<HttpRetryConfig>;
  readonly auth: Readonly<AuthConfig>;
  readonly debug: boolean;
}

/**
 * Public HTTP context value (for app components and useHttp hook)
 */
export interface HttpContextValue {
  /** The configured axios instance (null before initialization) */
  readonly axios: AxiosInstance | null;
  /** Whether the HTTP client is initialized */
  readonly isInitialized: boolean;
  /** Base URL of the HTTP client */
  readonly baseUrl: string;
}

/**
 * Internal HTTP context value (for sibling foundation libraries)
 */
export interface HttpInternals {
  /** The configured axios instance (null before initialization) */
  readonly axios: AxiosInstance | null;
  /** HTTP client configuration */
  readonly config: HttpClientConfig;
  /** Get current access token */
  readonly getAccessToken: () => Promise<string | null>;
}

/**
 * HttpProvider component props
 */
export interface HttpProviderProps {
  /** HTTP client configuration */
  readonly config: HttpClientConfig;
  /** Child components */
  readonly children: React.ReactNode;
  /** Optional auth internals for token retrieval */
  readonly authInternals?: {
    readonly getAccessToken: () => Promise<string | null>;
  };
}
