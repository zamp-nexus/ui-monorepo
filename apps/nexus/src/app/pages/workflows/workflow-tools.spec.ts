import { describe, expect, it } from 'vitest';

import { normalizeWorkflowTools } from './workflow-tools';

describe('normalizeWorkflowTools', () => {
  it('migrates the legacy semantic tools to the registered workflow tools', () => {
    expect(normalizeWorkflowTools(['semantic_catalog_search', 'semantic_query'])).toEqual([
      'connection_inventory',
      'schema_inspect',
      'data_query',
    ]);
  });
});
