import { useEffect, useState } from 'react';

import { useOrganization } from '@clerk/clerk-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';

import { useAuth } from '@open-zentra/foundation-auth';
import {
  Alert,
  Button,
  IconButton,
  Input,
  Label,
  Skeleton,
  useThemeMode,
} from '@open-zentra/foundation-design-system';
import { Icon } from '@open-zentra/foundation-icons';

import type { TokenSource } from '../../api';
import { getSettings, updateOrganizationPolicy } from './api';

const formatDate = (value: string) =>
  new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(new Date(value));

const Detail = ({ label, value }: { readonly label: string; readonly value: string }) => (
  <div>
    <dt className="font-mono text-[10px] font-medium uppercase tracking-[0.14em] text-foreground-muted">{label}</dt>
    <dd className="mt-1 text-sm text-foreground">{value}</dd>
  </div>
);

interface SettingsPageProps {
  readonly getToken: TokenSource;
}

export const SettingsPage = ({ getToken }: SettingsPageProps) => {
  const { user } = useAuth();
  const { organization } = useOrganization();
  const { preference, resolvedTheme, setPreference } = useThemeMode();
  const queryClient = useQueryClient();
  const settings = useQuery({ queryKey: ['settings'], queryFn: () => getSettings(getToken) });
  const [threshold, setThreshold] = useState('');
  const [costCeiling, setCostCeiling] = useState('');
  const [organizationName, setOrganizationName] = useState('');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!settings.data) return;
    setThreshold(settings.data.organization.confidence_threshold);
    setCostCeiling(settings.data.organization.cost_ceiling_usd);
    setOrganizationName(settings.data.organization.name);
  }, [settings.data]);

  const policy = useMutation({
    mutationFn: () =>
      updateOrganizationPolicy(getToken, {
        confidence_threshold: Number(threshold),
        cost_ceiling_usd: Number(costCeiling),
      }),
    onSuccess: (snapshot) => queryClient.setQueryData(['settings'], snapshot),
  });
  const rename = useMutation({
    mutationFn: async () => {
      if (!organization) throw new Error('Your Clerk organization is unavailable.');
      await organization.update({ name: organizationName.trim() });
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['settings'] }),
  });

  if (settings.isPending) {
    return <div className="mx-auto max-w-4xl space-y-5 p-6 md:p-10"><Skeleton className="h-8 w-40" /><Skeleton className="h-60 w-full" /></div>;
  }
  if (settings.error || !settings.data) {
    return <div className="mx-auto max-w-4xl p-6 md:p-10"><Alert intent="error" title="Settings are unavailable">{settings.error?.message ?? 'Try again shortly.'}</Alert></div>;
  }

  const data = settings.data;
  const canSavePolicy = data.capabilities.can_manage_organization && Number.isFinite(Number(threshold)) && Number.isFinite(Number(costCeiling));

  return (
    <div className="mx-auto max-w-4xl px-5 py-8 md:px-10 md:py-10">
      <header className="border-b border-border-subtle pb-7">
        <p className="font-mono text-[10px] font-medium uppercase tracking-[0.16em] text-primary">Workspace</p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="mt-2 max-w-xl text-sm text-foreground-muted">Manage your appearance, account context, and organization analysis policy.</p>
      </header>

      <div className="divide-y divide-border-subtle">
        <section className="grid gap-5 py-7 md:grid-cols-[11rem_1fr]">
          <div><h2 className="font-medium">Appearance</h2><p className="mt-1 text-sm text-foreground-muted">Choose how Nexus appears on this device.</p></div>
          <div>
            <div className="inline-flex rounded-md border border-border bg-background-muted p-1" role="group" aria-label="Color theme">
              {(['system', 'light', 'dark'] as const).map((option) => <Button key={option} intent={preference === option ? 'primary' : 'ghost'} size="sm" onClick={() => setPreference(option)}>{option[0].toUpperCase() + option.slice(1)}</Button>)}
            </div>
            <p className="mt-2 text-xs text-foreground-muted">Currently using {resolvedTheme} mode.</p>
          </div>
        </section>

        <section className="grid gap-5 py-7 md:grid-cols-[11rem_1fr]">
          <div><h2 className="font-medium">Account</h2><p className="mt-1 text-sm text-foreground-muted">Identity is managed through your sign-in provider.</p></div>
          <dl className="grid gap-5 sm:grid-cols-2">
            <Detail label="Name" value={user?.name ?? data.account.display_name ?? 'Not provided'} />
            <Detail label="Email" value={data.account.email} />
            <Detail label="Provider" value="Clerk" />
            <Detail label="Member since" value={formatDate(data.account.created_at)} />
          </dl>
        </section>

        <section className="grid gap-5 py-7 md:grid-cols-[11rem_1fr]">
          <div><h2 className="font-medium">Organization</h2><p className="mt-1 text-sm text-foreground-muted">Shared workspace identity and plan context.</p></div>
          <div className="space-y-5">
            <div className="flex gap-2"><Input aria-label="Organization name" value={organizationName} disabled={!data.capabilities.can_manage_organization} onChange={(event) => setOrganizationName(event.target.value)} /><Button disabled={!data.capabilities.can_manage_organization || !organizationName.trim() || rename.isPending} onClick={() => rename.mutate()}>{rename.isPending ? 'Saving…' : 'Save name'}</Button></div>
            {rename.error ? <Alert intent="error" title="Could not rename organization">{rename.error.message}</Alert> : null}
            <dl className="grid gap-5 sm:grid-cols-2">
              <Detail label="Your role" value={data.membership.role} />
              <Detail label="Joined" value={formatDate(data.membership.joined_at)} />
              <Detail label="Data residency" value={data.organization.data_residency_zone} />
              <Detail label="Model tier" value={data.organization.model_tier} />
              <div><dt className="font-mono text-[10px] font-medium uppercase tracking-[0.14em] text-foreground-muted">Organization ID</dt><dd className="mt-1 flex items-center gap-1"><code className="text-xs text-foreground-muted">{data.organization.organization_id}</code><IconButton aria-label="Copy organization ID" intent="ghost" size="sm" onClick={() => { void navigator.clipboard.writeText(data.organization.organization_id); setCopied(true); }}><Icon name={copied ? 'check' : 'copy'} size="sm" /></IconButton></dd></div>
              <Detail label="Created" value={formatDate(data.organization.created_at)} />
            </dl>
          </div>
        </section>

        <section className="grid gap-5 py-7 md:grid-cols-[11rem_1fr]">
          <div><h2 className="font-medium">Analysis policy</h2><p className="mt-1 text-sm text-foreground-muted">Controls applied to new analysis runs.</p></div>
          <div className="max-w-md space-y-4">
            <div><Label htmlFor="confidence-threshold">Confidence threshold</Label><Input id="confidence-threshold" type="number" min="0" max="1" step="0.01" value={threshold} disabled={!data.capabilities.can_manage_organization} onChange={(event) => setThreshold(event.target.value)} /></div>
            <div><Label htmlFor="cost-ceiling">Cost ceiling (USD)</Label><Input id="cost-ceiling" type="number" min="0" step="0.01" value={costCeiling} disabled={!data.capabilities.can_manage_organization} onChange={(event) => setCostCeiling(event.target.value)} /></div>
            {data.capabilities.can_manage_organization ? <Button disabled={!canSavePolicy || policy.isPending} onClick={() => policy.mutate()}>{policy.isPending ? 'Saving…' : 'Save policy'}</Button> : <p className="text-sm text-foreground-muted">Only organization owners can change analysis policy.</p>}
            {policy.error ? <Alert intent="error" title="Could not save policy">{policy.error.message}</Alert> : null}
          </div>
        </section>

        <section className="grid gap-5 py-7 md:grid-cols-[11rem_1fr]">
          <div><h2 className="font-medium">Data and support</h2></div>
          <div className="flex flex-wrap gap-2"><Button component={Link} to="/connections" intent="secondary">Manage connections</Button><Button component="a" href="https://github.com/openzentra/nexus" target="_blank" rel="noreferrer" intent="ghost">Documentation</Button></div>
        </section>
      </div>
    </div>
  );
};
