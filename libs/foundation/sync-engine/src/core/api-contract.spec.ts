import { describe, expect, it } from 'vitest';

import { CRUD_OPERATION } from '../convex/functions';
import { NETWORK_STATUS_EVENT } from '../network/index';
import { SyncEngineContainer, SyncEngineFactory } from './container';

describe('sync-engine api contract', () => {
  it('removes deprecated synchronous disposal APIs', () => {
    expect('dispose' in SyncEngineContainer.prototype).toBe(false);
    expect('disposeContainer' in SyncEngineFactory.prototype).toBe(false);
    expect('disposeAll' in SyncEngineFactory.prototype).toBe(false);
  });

  it('exports UPPER_SNAKE_CASE network status event constants', () => {
    expect(NETWORK_STATUS_EVENT.ONLINE).toBe('online');
    expect(NETWORK_STATUS_EVENT.OFFLINE).toBe('offline');
    expect(NETWORK_STATUS_EVENT.CONNECTIVITY_CHECK).toBe('connectivity_check');
  });

  it('exports UPPER_SNAKE_CASE CRUD operation constants', () => {
    expect(CRUD_OPERATION.LIST).toBe('list');
    expect(CRUD_OPERATION.GET).toBe('get');
    expect(CRUD_OPERATION.CREATE).toBe('create');
    expect(CRUD_OPERATION.UPDATE).toBe('update');
    expect(CRUD_OPERATION.DELETE).toBe('delete');
  });
});
