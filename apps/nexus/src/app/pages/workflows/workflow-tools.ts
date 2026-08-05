export const WORKFLOW_TOOL_CATALOG = [
  ['connection_inventory', '1. Connection inventory'],
  ['schema_inspect', '2. Inspect schema'],
  ['data_query', '3. Query data'],
] as const;

const REGISTERED_TOOLS: ReadonlySet<string> = new Set(
  WORKFLOW_TOOL_CATALOG.map(([tool]) => tool),
);

const LEGACY_TOOL_REPLACEMENTS: Record<string, readonly string[]> = {
  semantic_catalog_search: ['connection_inventory', 'schema_inspect'],
  semantic_query: ['data_query'],
};

export const normalizeWorkflowTools = (tools: readonly string[] | undefined) => {
  if (!tools) return undefined;

  return [...new Set(tools.flatMap((tool) => LEGACY_TOOL_REPLACEMENTS[tool] ?? (REGISTERED_TOOLS.has(tool) ? [tool] : [])))];
};
