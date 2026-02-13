import { describe, it, expect } from 'vitest';

import { SyncEngineContainer, SyncEngineFactory } from './container';
import { NETWORK_STATUS_EVENT } from '../network';
import { CRUD_OPERATION } from '../convex/functions';

describe('sync-engine api contract', () => {
  it('removes deprecated synchronous disposal APIs', () => {
    expect('dispose' in SyncEngineContainer.prototype).toBe(false);
    expect('disposeContainer' in SyncEngineFactory.prototype).toBe(false);
    expect('disposeAll' in SyncEngineFactory.prototype).toBe(false);
  });

  it('exports UPPER_SNAKE_CASE network status event constants', () => {
    expect(NETWORK_STATUS_EVENT.ONLINE).toBe('online');
    expect(NETWORK_STATUS_EVENT.OFFLINE).toBe('offline');
    expect(NETWORK_STATUS_EVENT.CONNECTIVITY_CHECK).toBe('connectivity-check');
  });

  it('exports UPPER_SNAKE_CASE CRUD operation constants', () => {
    expect(CRUD_OPERATION.LIST).toBe('list');
    expect(CRUD_OPERATION.GET).toBe('get');
    expect(CRUD_OPERATION.CREATE).toBe('create');
    expect(CRUD_OPERATION.UPDATE).toBe('update');
    expect(CRUD_OPERATION.DELETE).toBe('delete');
  });
});
