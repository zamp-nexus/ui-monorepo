/**
 * HTTP Provider
 *
 * React provider that creates and manages a configured axios instance,
 * exposing it via two contexts: a public one for application code and
 * an internal one for sibling foundation libraries.
 *
 * @module provider/http-provider
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';

import type { AxiosInstance } from 'axios';

import { createDebugLogger } from '@open-insights-web/foundation-utils';

import { createConfigSignature } from '../core/config-signature';
import type {
  HttpClientConfig,
  HttpContextValue,
  HttpInternals,
  HttpProviderProps,
  ResolvedHttpConfig,
} from '../core/types';
import { createAxiosInstance } from '../instance/axios-factory';
import { removeInterceptors, setupInterceptors, type InterceptorIds } from '../interceptors/setup';
import { HttpContext } from './http-context';
import { HttpInternalsContext } from './http-internals-context';

// =============================================================================
// Provider Component
// =============================================================================

export const HttpProvider = ({
  config,
  children,
  authInternals,
}: HttpProviderProps): React.ReactElement => {
  const [isInitialized, setIsInitialized] = useState(false);
  const [axiosInstance, setAxiosInstance] = useState<AxiosInstance | null>(null);
  const [resolvedConfig, setResolvedConfig] = useState<ResolvedHttpConfig | null>(null);

  const interceptorIdsRef = useRef<InterceptorIds | null>(null);
  const configRef = useRef<HttpClientConfig>(config);
  configRef.current = config;

  const authInternalsRef = useRef(authInternals);
  authInternalsRef.current = authInternals;

  const logger = useMemo(
    () => createDebugLogger('HttpProvider', config.debug ?? false),
    [config.debug],
  );

  const configSignature = useMemo(
    () =>
      createConfigSignature({
        config,
        authInternalsGetAccessToken: authInternals?.getAccessToken,
      }),
    [config, authInternals?.getAccessToken],
  );

  useEffect(() => {
    const currentConfig = configRef.current;
    const { instance, resolvedConfig: resolved } = createAxiosInstance(currentConfig);

    const getAccessToken =
      authInternalsRef.current?.getAccessToken ??
      resolved.auth.getAccessToken ??
      (async () => null);

    const ids = setupInterceptors(instance, resolved, {
      getAccessToken,
      clientHeaders: currentConfig.clientHeaders,
    });

    interceptorIdsRef.current = ids;

    setAxiosInstance(instance);
    setResolvedConfig(resolved);
    setIsInitialized(true);

    logger.debug('Initialized with config:', {
      baseUrl: resolved.baseUrl,
      timeout: resolved.timeout,
      authEnabled: resolved.auth.enabled,
      retryEnabled: resolved.retry.enabled,
      circuitBreakerEnabled: resolved.circuitBreaker.enabled,
    });

    return () => {
      if (interceptorIdsRef.current) {
        removeInterceptors(instance, interceptorIdsRef.current);
        interceptorIdsRef.current = null;
      }

      logger.debug('Disposed');
    };
  }, [configSignature, logger]); // Re-initialize when config values/functions change

  const getAccessToken = useMemo(
    () =>
      authInternalsRef.current?.getAccessToken ??
      resolvedConfig?.auth.getAccessToken ??
      (async () => null),
    [resolvedConfig],
  );

  const contextValue = useMemo<HttpContextValue>(
    () => ({
      axios: axiosInstance,
      isInitialized,
      baseUrl: resolvedConfig?.baseUrl ?? config.baseUrl,
    }),
    [axiosInstance, resolvedConfig, isInitialized, config.baseUrl],
  );

  const internalsValue = useMemo<HttpInternals>(
    () => ({
      axios: axiosInstance,
      config: configRef.current,
      getAccessToken,
    }),
    [axiosInstance, getAccessToken],
  );

  return (
    <HttpContext.Provider value={contextValue}>
      <HttpInternalsContext.Provider value={internalsValue}>
        {children}
      </HttpInternalsContext.Provider>
    </HttpContext.Provider>
  );
};
