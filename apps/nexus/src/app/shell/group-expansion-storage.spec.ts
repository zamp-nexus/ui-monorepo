/// <reference types="vitest/globals" />
import { loadExpandedGroupIds, saveExpandedGroupIds } from './group-expansion-storage';

describe('group expansion storage', () => {
  beforeEach(() => window.localStorage.clear());

  it('keeps expansion preferences scoped to one organization', () => {
    saveExpandedGroupIds('org-a', ['group-1', 'group-2']);
    saveExpandedGroupIds('org-b', ['group-3']);

    expect(loadExpandedGroupIds('org-a')).toEqual(['group-1', 'group-2']);
    expect(loadExpandedGroupIds('org-b')).toEqual(['group-3']);
  });

  it('ignores invalid saved values', () => {
    window.localStorage.setItem('nexus:expanded-groups:org-a', '{invalid');

    expect(loadExpandedGroupIds('org-a')).toEqual([]);
  });
});
