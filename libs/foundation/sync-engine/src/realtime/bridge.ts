/**
 * Realtime bridge for propagating inbound events to cache invalidation.
 * @module realtime/bridge
 */

import type { QueryClient } from '@tanstack/react-query';

import type { QueryKeyBase } from '@open-insights-web/foundation-data-model';
import { createDebugLogger, Disposable } from '@open-insights-web/foundation-utils';

import type { ICrossTabManager } from '../core/interfaces';

export interface RealtimeBridgeEvent {
  readonly table: string;
  readonly queryKeys?: ReadonlyArray<QueryKeyBase>;
}

export interface RealtimeEventBridgeConfig {
  readonly queryClient: QueryClient;
  readonly crossTabManager?: ICrossTabManager | null;
  readonly debug?: boolean;
}

export class RealtimeEventBridge extends Disposable {
  private readonly queryClient: QueryClient;
  private readonly crossTabManager: ICrossTabManager | null;
  private readonly logger;

  constructor(config: RealtimeEventBridgeConfig) {
    super();
    this.queryClient = config.queryClient;
    this.crossTabManager = config.crossTabManager ?? null;
    this.logger = createDebugLogger('RealtimeEventBridge', config.debug ?? false);
  }

  apply(event: RealtimeBridgeEvent): void {
    this.ensureNotDisposed();
    const keys = event.queryKeys ?? [[event.table]];

    this.logger.debug('Applying realtime bridge event for', event.table, keys);
    keys.forEach((queryKey) => {
      this.queryClient.invalidateQueries({ queryKey });
    });
    this.crossTabManager?.invalidateQueries([...keys]);
  }

  protected onDispose(): void {}
}

export const createRealtimeEventBridge = (
  config: RealtimeEventBridgeConfig,
): RealtimeEventBridge => new RealtimeEventBridge(config);
