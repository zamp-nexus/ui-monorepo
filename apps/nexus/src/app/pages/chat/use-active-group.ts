/**
 * Where a chat gets its Group.
 *
 * Chat Sessions belong directly to a Group now — there is no Project layer
 * between them (ADR-0028). The chat surface still shows neither: someone
 * asking a question about refunds should not first have to invent an
 * organisational hierarchy. So the first visit provisions a Group and every
 * later visit reuses it.
 *
 * This is a hook rather than a call site so that a Group picker, when one is
 * wanted, replaces the resolution without touching the chat page.
 */

import { useQuery } from '@tanstack/react-query';

import { useAuth } from '@open-zentra/foundation-auth';

import { ApiError, type TokenSource } from '../../api';
import { createGroup, listGroups } from './api';

const DEFAULT_GROUP_NAME = 'Workspace';

export const activeGroupKey = ['chat', 'active-group'] as const;

export class ProvisioningDenied extends Error {
  constructor() {
    super(
      'You do not have a workspace to chat in yet, and your role cannot create one. Ask an owner or admin to add you to one.',
    );
    this.name = 'ProvisioningDenied';
  }
}

/**
 * Resolve the Group to open Chat Sessions in, creating one if the tenant has
 * none.
 *
 * The whole chain lives in a single query so React Query's in-flight dedupe
 * covers it. Two components mounting at once share one resolution rather than
 * racing to create two Groups.
 */
const resolveGroupId = async (getToken: TokenSource): Promise<string> => {
  const groups = await listGroups(getToken);
  // Archived Groups still list; opening new work in one would be surprising.
  const group = groups.items.find((candidate) => candidate.archived_at === null);
  if (group) return group.group_id;

  // `can_manage` is the server's own answer about this actor, so it is asked
  // rather than inferred from a role — but a viewer who reaches the create
  // anyway gets the same explanation rather than a bare 403.
  const created = await createGroup(getToken, DEFAULT_GROUP_NAME).catch((error: unknown) => {
    if (error instanceof ApiError && error.status === 403) throw new ProvisioningDenied();
    throw error;
  });
  return created.group_id;
};

export const useActiveGroup = (getToken: TokenSource) => {
  const { tenant } = useAuth();
  return useQuery({
    // Scoped by organization: an in-SPA org switch must resolve (and, for a
    // fresh org, provision) a Group of its own rather than reusing the
    // previous organization's answer.
    queryKey: [...activeGroupKey, tenant?.id],
    queryFn: () => resolveGroupId(getToken),
    // The answer changes about once per tenant lifetime.
    staleTime: Number.POSITIVE_INFINITY,
    // Retrying a create that already succeeded is how duplicates happen.
    retry: false,
  });
};
