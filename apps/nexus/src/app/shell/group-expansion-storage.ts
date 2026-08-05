const storageKeyFor = (organizationId: string) => `nexus:expanded-groups:${organizationId}`;

const isStringArray = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((item) => typeof item === 'string');

export const loadExpandedGroupIds = (organizationId: string): string[] => {
  if (typeof window === 'undefined') return [];

  try {
    const stored = window.localStorage.getItem(storageKeyFor(organizationId));
    const parsed: unknown = stored ? JSON.parse(stored) : [];
    return isStringArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

export const saveExpandedGroupIds = (organizationId: string, groupIds: readonly string[]) => {
  if (typeof window === 'undefined') return;

  try {
    window.localStorage.setItem(storageKeyFor(organizationId), JSON.stringify(groupIds));
  } catch {
    // Navigation preferences are optional when browser storage is unavailable.
  }
};
