const REGISTERED_TOOLS = new Set([
  'connection_inventory',
  'schema_inspect',
  'data_query',
]);

const LEGACY_TOOL_REPLACEMENTS: Record<string, readonly string[]> = {
  semantic_catalog_search: ['connection_inventory', 'schema_inspect'],
  semantic_query: ['data_query'],
};

export const normalizeWorkflowTools = (tools: readonly string[] | undefined) => {
  if (!tools) return undefined;

  return [...new Set(tools.flatMap((tool) => LEGACY_TOOL_REPLACEMENTS[tool] ?? (REGISTERED_TOOLS.has(tool) ? [tool] : [])))];
};
