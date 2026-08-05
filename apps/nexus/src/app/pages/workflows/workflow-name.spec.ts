import { describe, expect, it } from 'vitest';

import { normalizedWorkflowName, workflowNameError } from './workflow-name';

describe('workflow names', () => {
  it('trims a valid name before it is saved', () => {
    expect(normalizedWorkflowName('  Revenue review  ')).toBe('Revenue review');
  });

  it('rejects blank and overlong names', () => {
    expect(workflowNameError('   ')).toBe('Enter a workflow name.');
    expect(workflowNameError('a'.repeat(121))).toBe('Workflow names can be at most 120 characters.');
  });
});
