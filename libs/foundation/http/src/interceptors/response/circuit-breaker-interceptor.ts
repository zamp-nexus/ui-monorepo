/**
 * Circuit Breaker Response Interceptor
 *
 * Tracks consecutive failures per host and short-circuits requests when a
 * host is determined to be unhealthy, preventing thundering-herd retries.
 *
 * States:
 * - CLOSED  – normal operation; all requests pass through.
 * - OPEN    – host considered down; requests are immediately rejected.
 * - HALF_OPEN – after a cooldown period one probe request is allowed. If it
 *   succeeds the circuit closes; otherwise it reopens.
 *
 * @module interceptors/response/circuit-breaker-interceptor
 */

import type {
  AxiosInstance,
  AxiosResponse,
  InternalAxiosRequestConfig,
} from 'axios';
import { isAxiosError } from 'axios';
import { AXIOS_ERROR_CODE } from '../../core/constants';

// =============================================================================
// Types
// =============================================================================

/** Circuit breaker configuration */
export interface CircuitBreakerConfig {
  /** Number of consecutive failures before the circuit opens (default: 5) */
  readonly failureThreshold: number;
  /** Time in ms before a probe request is allowed (default: 30 000) */
  readonly resetTimeoutMs: number;
  /** Maximum number of probe requests while in half-open state (default: 1) */
  readonly halfOpenMaxRequests: number;
  /** HTTP status codes that count as failures (default: 500-599) */
  readonly failureStatusCodes: readonly number[];
  /** Whether network/timeout errors count as failures (default: true) */
  readonly countNetworkErrors: boolean;
  /** Enable debug logging (default: false) */
  readonly debug: boolean;
}

/** Circuit states */
const CIRCUIT_STATE = {
  CLOSED: 'closed',
  OPEN: 'open',
  HALF_OPEN: 'half_open',
} as const;

type CircuitState = (typeof CIRCUIT_STATE)[keyof typeof CIRCUIT_STATE];

/** Per-host circuit state */
interface HostCircuit {
  state: CircuitState;
  failureCount: number;
  lastFailureTime: number;
  halfOpenRequests: number;
}

// =============================================================================
// Defaults
// =============================================================================

export const DEFAULT_CIRCUIT_BREAKER_CONFIG: Readonly<CircuitBreakerConfig> = Object.freeze({
  failureThreshold: 5,
  resetTimeoutMs: 30_000,
  halfOpenMaxRequests: 1,
  failureStatusCodes: [500, 502, 503, 504],
  countNetworkErrors: true,
  debug: false,
});

// =============================================================================
// Circuit Breaker
// =============================================================================

/**
 * Per-host circuit breaker tracker.
 *
 * This is intentionally a standalone class so it can be unit-tested
 * independently and shared across interceptor registrations.
 */
export class CircuitBreaker {
  private readonly circuits = new Map<string, HostCircuit>();
  private readonly config: CircuitBreakerConfig;

  constructor(config: Partial<CircuitBreakerConfig> = {}) {
    this.config = { ...DEFAULT_CIRCUIT_BREAKER_CONFIG, ...config };
  }

  /**
   * Extract host key from a URL or request config.
   */
  getHostKey(url: string | undefined): string {
    if (!url) return '__unknown__';
    try {
      const parsed = new URL(url);
      return parsed.host;
    } catch {
      return url;
    }
  }

  /**
   * Check whether a request to the given host should be allowed.
   */
  allowRequest(host: string): boolean {
    const circuit = this.circuits.get(host);
    if (!circuit) return true;

    switch (circuit.state) {
      case CIRCUIT_STATE.CLOSED:
        return true;

      case CIRCUIT_STATE.OPEN: {
        // Check if enough time has passed to move to half-open
        if (Date.now() - circuit.lastFailureTime >= this.config.resetTimeoutMs) {
          circuit.state = CIRCUIT_STATE.HALF_OPEN;
          circuit.halfOpenRequests = 0;
          this.log(`Circuit for ${host} moved to HALF_OPEN`);
          return true;
        }
        return false;
      }

      case CIRCUIT_STATE.HALF_OPEN:
        return circuit.halfOpenRequests < this.config.halfOpenMaxRequests;
    }
  }

  /**
   * Record a successful response.
   */
  recordSuccess(host: string): void {
    const circuit = this.circuits.get(host);
    if (!circuit) return;

    if (circuit.state === CIRCUIT_STATE.HALF_OPEN) {
      this.log(`Circuit for ${host} CLOSED after successful probe`);
    }

    // Reset to healthy state
    circuit.state = CIRCUIT_STATE.CLOSED;
    circuit.failureCount = 0;
    circuit.halfOpenRequests = 0;
  }

  /**
   * Record a failure response.
   */
  recordFailure(host: string): void {
    let circuit = this.circuits.get(host);
    if (!circuit) {
      circuit = {
        state: CIRCUIT_STATE.CLOSED,
        failureCount: 0,
        lastFailureTime: 0,
        halfOpenRequests: 0,
      };
      this.circuits.set(host, circuit);
    }

    circuit.failureCount++;
    circuit.lastFailureTime = Date.now();

    if (circuit.state === CIRCUIT_STATE.HALF_OPEN) {
      // Probe failed — reopen
      circuit.state = CIRCUIT_STATE.OPEN;
      this.log(`Circuit for ${host} re-OPENED after failed probe`);
      return;
    }

    if (circuit.failureCount >= this.config.failureThreshold) {
      circuit.state = CIRCUIT_STATE.OPEN;
      this.log(`Circuit for ${host} OPENED after ${circuit.failureCount} consecutive failures`);
    }
  }

  /**
   * Increment half-open probe counter.
   */
  recordHalfOpenRequest(host: string): void {
    const circuit = this.circuits.get(host);
    if (circuit?.state === CIRCUIT_STATE.HALF_OPEN) {
      circuit.halfOpenRequests++;
    }
  }

  /**
   * Get the current state for a host (for diagnostics).
   */
  getState(host: string): CircuitState {
    return this.circuits.get(host)?.state ?? CIRCUIT_STATE.CLOSED;
  }

  /**
   * Reset all circuit state (for testing).
   */
  reset(): void {
    this.circuits.clear();
  }

  private log(message: string): void {
    if (this.config.debug) {
      console.log(`[CircuitBreaker] ${message}`);
    }
  }
}

// =============================================================================
// Interceptor
// =============================================================================

/**
 * Determines whether an HTTP status should be counted as a circuit-breaker
 * failure.
 */
const isFailureStatus = (status: number, failureStatusCodes: readonly number[]): boolean =>
  failureStatusCodes.includes(status);

/**
 * Determines whether an AxiosError is a network/timeout error that should
 * count as a circuit-breaker failure.
 */
const isNetworkFailure = (error: unknown): boolean => {
  if (!isAxiosError(error)) return false;
  return (
    error.code === AXIOS_ERROR_CODE.NETWORK ||
    error.code === AXIOS_ERROR_CODE.TIMEOUT ||
    error.code === AXIOS_ERROR_CODE.TIMEOUT_ALT
  );
};

export interface CircuitBreakerInterceptorOptions {
  readonly circuitBreaker: CircuitBreaker;
  readonly config: CircuitBreakerConfig;
}

/**
 * Creates the circuit breaker response interceptor.
 *
 * Must be registered BEFORE the retry interceptor so that the circuit
 * breaker can reject requests before retries are attempted.
 */
export const createCircuitBreakerInterceptor = (
  options: CircuitBreakerInterceptorOptions,
) => {
  const { circuitBreaker, config } = options;

  const onFulfilled = (response: AxiosResponse): AxiosResponse => {
    const host = circuitBreaker.getHostKey(response.config.url ?? response.config.baseURL);

    if (isFailureStatus(response.status, config.failureStatusCodes)) {
      circuitBreaker.recordFailure(host);
    } else {
      circuitBreaker.recordSuccess(host);
    }

    return response;
  };

  const onRejected = async (error: unknown): Promise<never> => {
    if (config.countNetworkErrors && isNetworkFailure(error)) {
      const url = (error as { config?: InternalAxiosRequestConfig }).config?.url ??
        (error as { config?: InternalAxiosRequestConfig }).config?.baseURL;
      const host = circuitBreaker.getHostKey(url);
      circuitBreaker.recordFailure(host);
    }
    throw error;
  };

  return { onFulfilled, onRejected };
};

/**
 * Creates a request interceptor that rejects requests when the circuit
 * for the target host is open.
 */
export const createCircuitBreakerRequestInterceptor = (
  circuitBreaker: CircuitBreaker,
) => {
  const onFulfilled = (config: InternalAxiosRequestConfig): InternalAxiosRequestConfig => {
    const host = circuitBreaker.getHostKey(config.url ?? config.baseURL);

    if (!circuitBreaker.allowRequest(host)) {
      throw new Error(`Circuit breaker open for ${host} — request rejected`);
    }

    // Track half-open probe requests
    if (circuitBreaker.getState(host) === 'half_open') {
      circuitBreaker.recordHalfOpenRequest(host);
    }

    return config;
  };

  return { onFulfilled };
};

/**
 * Registers both request and response circuit breaker interceptors.
 *
 * @returns Object with the CircuitBreaker instance and interceptor IDs for removal.
 */
export const setupCircuitBreakerInterceptor = (
  instance: AxiosInstance,
  config: Partial<CircuitBreakerConfig> = {},
): { circuitBreaker: CircuitBreaker; requestInterceptorId: number; responseInterceptorId: number } => {
  const resolvedConfig: CircuitBreakerConfig = { ...DEFAULT_CIRCUIT_BREAKER_CONFIG, ...config };
  const circuitBreaker = new CircuitBreaker(resolvedConfig);

  const { onFulfilled: requestFulfilled } = createCircuitBreakerRequestInterceptor(circuitBreaker);
  const requestInterceptorId = instance.interceptors.request.use(requestFulfilled);

  const { onFulfilled, onRejected } = createCircuitBreakerInterceptor({
    circuitBreaker,
    config: resolvedConfig,
  });
  const responseInterceptorId = instance.interceptors.response.use(onFulfilled, onRejected);

  return { circuitBreaker, requestInterceptorId, responseInterceptorId };
};
