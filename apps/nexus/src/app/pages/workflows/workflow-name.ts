export const workflowNameError = (value: string) => {
  if (!value.trim()) return 'Enter a workflow name.';
  if (value.trim().length > 120) return 'Workflow names can be at most 120 characters.';
  return undefined;
};

export const normalizedWorkflowName = (value: string) => value.trim();
