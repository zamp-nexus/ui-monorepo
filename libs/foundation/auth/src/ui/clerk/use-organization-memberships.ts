import { useMemo } from 'react';

import { useOrganizationList } from '@clerk/clerk-react';

export interface OrganizationMembershipOption {
  readonly id: string;
  readonly name: string;
}

export interface UseOrganizationMembershipsResult {
  /** True once Clerk has loaded the signed-in user's organization memberships. */
  readonly isLoaded: boolean;
  readonly memberships: readonly OrganizationMembershipOption[];
}

/**
 * Wraps Clerk's `useOrganizationList()` down to the shape an onboarding
 * picker needs: the signed-in user's organization memberships, and whether
 * they have loaded yet. Keeps `@clerk/clerk-react`'s pagination-oriented
 * hook out of the app.
 */
export const useOrganizationMemberships = (): UseOrganizationMembershipsResult => {
  const { isLoaded, userMemberships } = useOrganizationList({ userMemberships: true });

  return useMemo(
    () => ({
      isLoaded: isLoaded && !userMemberships.isLoading,
      memberships: (userMemberships.data ?? []).map((membership) => ({
        id: membership.organization.id,
        name: membership.organization.name,
      })),
    }),
    [isLoaded, userMemberships.data, userMemberships.isLoading],
  );
};
