/**
 * Circuit Breaker Interceptor Tests
 *
 * Tests for the per-host circuit breaker: state transitions,
 * failure tracking, half-open probes, and reset behavior.
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  CircuitBreaker,
  DEFAULT_CIRCUIT_BREAKER_CONFIG,
} from './circuit-breaker-interceptor';

describe('CircuitBreaker', () => {
  let breaker: CircuitBreaker;

  beforeEach(() => {
    breaker = new CircuitBreaker({ failureThreshold: 3, resetTimeoutMs: 1000 });
  });

  // ---------------------------------------------------------------------------
  // Initial state
  // ---------------------------------------------------------------------------

  describe('initial state', () => {
    it('should allow requests for unknown hosts', () => {
      expect(breaker.allowRequest('example.com')).toBe(true);
    });

    it('should report closed state for unknown hosts', () => {
      expect(breaker.getState('example.com')).toBe('closed');
    });
  });

  // ---------------------------------------------------------------------------
  // getHostKey
  // ---------------------------------------------------------------------------

  describe('getHostKey', () => {
    it('should extract host from URL', () => {
      expect(breaker.getHostKey('https://api.example.com/v1/users')).toBe('api.example.com');
    });

    it('should return __unknown__ for undefined URL', () => {
      expect(breaker.getHostKey(undefined)).toBe('__unknown__');
    });

    it('should return raw string for invalid URL', () => {
      expect(breaker.getHostKey('/relative/path')).toBe('/relative/path');
    });
  });

  // ---------------------------------------------------------------------------
  // Failure tracking → OPEN
  // ---------------------------------------------------------------------------

  describe('failure tracking', () => {
    it('should stay closed below threshold', () => {
      breaker.recordFailure('host');
      breaker.recordFailure('host');
      expect(breaker.getState('host')).toBe('closed');
      expect(breaker.allowRequest('host')).toBe(true);
    });

    it('should open circuit at failure threshold', () => {
      for (let i = 0; i < 3; i++) {
        breaker.recordFailure('host');
      }
      expect(breaker.getState('host')).toBe('open');
      expect(breaker.allowRequest('host')).toBe(false);
    });

    it('should track failures per host independently', () => {
      for (let i = 0; i < 3; i++) {
        breaker.recordFailure('hostA');
      }
      expect(breaker.getState('hostA')).toBe('open');
      expect(breaker.getState('hostB')).toBe('closed');
      expect(breaker.allowRequest('hostB')).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // Success resets circuit
  // ---------------------------------------------------------------------------

  describe('success tracking', () => {
    it('should reset failure count on success', () => {
      breaker.recordFailure('host');
      breaker.recordFailure('host');
      breaker.recordSuccess('host');
      // Should have reset — 3 more failures needed to open
      breaker.recordFailure('host');
      breaker.recordFailure('host');
      expect(breaker.getState('host')).toBe('closed');
    });

    it('should be a no-op for unknown hosts', () => {
      // Should not throw
      breaker.recordSuccess('unknown-host');
      expect(breaker.getState('unknown-host')).toBe('closed');
    });
  });

  // ---------------------------------------------------------------------------
  // OPEN → HALF_OPEN transition (after timeout)
  // ---------------------------------------------------------------------------

  describe('OPEN → HALF_OPEN transition', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('should transition to half_open after resetTimeoutMs', () => {
      for (let i = 0; i < 3; i++) {
        breaker.recordFailure('host');
      }
      expect(breaker.allowRequest('host')).toBe(false);

      // Advance past reset timeout
      vi.advanceTimersByTime(1001);

      // Should now allow a probe request
      expect(breaker.allowRequest('host')).toBe(true);
      expect(breaker.getState('host')).toBe('half_open');
    });

    it('should not transition before resetTimeoutMs', () => {
      for (let i = 0; i < 3; i++) {
        breaker.recordFailure('host');
      }
      vi.advanceTimersByTime(500);
      expect(breaker.allowRequest('host')).toBe(false);
    });
  });

  // ---------------------------------------------------------------------------
  // HALF_OPEN behavior
  // ---------------------------------------------------------------------------

  describe('HALF_OPEN behavior', () => {
    beforeEach(() => {
      vi.useFakeTimers();
      for (let i = 0; i < 3; i++) {
        breaker.recordFailure('host');
      }
      vi.advanceTimersByTime(1001);
      // Trigger transition to half_open
      breaker.allowRequest('host');
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('should close on successful probe', () => {
      breaker.recordSuccess('host');
      expect(breaker.getState('host')).toBe('closed');
      expect(breaker.allowRequest('host')).toBe(true);
    });

    it('should reopen on failed probe', () => {
      breaker.recordFailure('host');
      expect(breaker.getState('host')).toBe('open');
      expect(breaker.allowRequest('host')).toBe(false);
    });

    it('should limit half-open requests', () => {
      breaker.recordHalfOpenRequest('host');
      // Default halfOpenMaxRequests is 1
      expect(breaker.allowRequest('host')).toBe(false);
    });
  });

  // ---------------------------------------------------------------------------
  // Reset
  // ---------------------------------------------------------------------------

  describe('reset', () => {
    it('should clear all circuit state', () => {
      for (let i = 0; i < 3; i++) {
        breaker.recordFailure('host');
      }
      expect(breaker.getState('host')).toBe('open');

      breaker.reset();
      expect(breaker.getState('host')).toBe('closed');
      expect(breaker.allowRequest('host')).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // Default config
  // ---------------------------------------------------------------------------

  describe('DEFAULT_CIRCUIT_BREAKER_CONFIG', () => {
    it('should have expected defaults', () => {
      expect(DEFAULT_CIRCUIT_BREAKER_CONFIG.failureThreshold).toBe(5);
      expect(DEFAULT_CIRCUIT_BREAKER_CONFIG.resetTimeoutMs).toBe(30_000);
      expect(DEFAULT_CIRCUIT_BREAKER_CONFIG.halfOpenMaxRequests).toBe(1);
      expect(DEFAULT_CIRCUIT_BREAKER_CONFIG.failureStatusCodes).toEqual([500, 502, 503, 504]);
      expect(DEFAULT_CIRCUIT_BREAKER_CONFIG.countNetworkErrors).toBe(true);
    });

    it('should be frozen', () => {
      expect(Object.isFrozen(DEFAULT_CIRCUIT_BREAKER_CONFIG)).toBe(true);
    });
  });
});
