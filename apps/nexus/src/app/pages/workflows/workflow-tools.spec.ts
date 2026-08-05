import { describe, expect, it } from 'vitest';

import { normalizeWorkflowTools, WORKFLOW_TOOL_CATALOG } from './workflow-tools';

describe('normalizeWorkflowTools', () => {
  it('migrates the legacy semantic tools to the registered workflow tools', () => {
    expect(normalizeWorkflowTools(['semantic_catalog_search', 'semantic_query'])).toEqual([
      'connection_inventory',
      'schema_inspect',
      'data_query',
    ]);
  });

  it('removes obsolete tools and deduplicates the canonical output', () => {
    expect(normalizeWorkflowTools(['raw_query', 'data_query', 'semantic_query', 'unknown'])).toEqual([
      'data_query',
    ]);
  });

  it('keeps the Studio tool catalog in the governed progression order', () => {
    expect(WORKFLOW_TOOL_CATALOG.map(([tool]) => tool)).toEqual([
      'connection_inventory',
      'schema_inspect',
      'data_query',
    ]);
  });
});
