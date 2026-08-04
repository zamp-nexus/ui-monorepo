import { requestJson, type TokenSource } from '../../api';

export interface SettingsSnapshot {
  readonly account: { readonly user_id: string; readonly email: string; readonly display_name: string | null; readonly created_at: string };
  readonly membership: { readonly role: string; readonly joined_at: string };
  readonly organization: {
    readonly organization_id: string;
    readonly name: string;
    readonly created_at: string;
    readonly data_residency_zone: string;
    readonly model_tier: string;
    readonly confidence_threshold: string;
    readonly cost_ceiling_usd: string;
  };
  readonly capabilities: { readonly can_manage_organization: boolean };
}

export const getSettings = (getToken: TokenSource) => requestJson<SettingsSnapshot>('/v1/settings', getToken);

export const updateOrganizationPolicy = (
  getToken: TokenSource,
  policy: { readonly confidence_threshold?: number; readonly cost_ceiling_usd?: number },
) =>
  requestJson<SettingsSnapshot>('/v1/settings/organization', getToken, {
    method: 'PATCH',
    body: JSON.stringify(policy),
  });
