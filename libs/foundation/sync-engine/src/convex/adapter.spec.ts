import { afterEach, describe, expect, it, vi } from 'vitest';

import { ConvexSyncAdapter } from './adapter';

describe('ConvexSyncAdapter subscriptions', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('keeps per-subscription base poll interval on refresh', async () => {
    const queryMock = vi.fn(async () => ({ ok: true }));

    const adapter = new ConvexSyncAdapter({
      client: {
        query: queryMock,
        mutation: vi.fn(),
      } as never,
      debug: false,
    });

    const unsubscribe = adapter.subscribe(
      {} as never,
      {} as never,
      {
        onUpdate: vi.fn(),
      },
      10_000,
    );

    await Promise.resolve();
    await Promise.resolve();

    const subscriptions = (
      adapter as unknown as {
        subscriptions: Map<string, { currentInterval: number; baseInterval: number }>;
      }
    ).subscriptions;

    const state = subscriptions.values().next().value;
    expect(state.baseInterval).toBe(10_000);

    adapter.refreshSubscriptions();
    expect(state.currentInterval).toBe(10_000);

    unsubscribe();
    adapter.dispose();
  });
});
