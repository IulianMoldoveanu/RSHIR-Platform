// Lane AGGREGATOR-EMAIL-INTAKE — PR 3 of 3.
// Inbox + audit view for forwarded order emails.

import { createAdminClient } from '@/lib/supabase/admin';
import { getActiveTenant, getTenantRole } from '@/lib/tenant';
import { InboxClient } from './inbox-client';

export const dynamic = 'force-dynamic';

type Job = {
  id: string;
  sender: string | null;
  subject: string | null;
  received_at: string;
  status: string;
  detected_source: string | null;
  parsed_data: Record<string, unknown> | null;
  applied_order_id: string | null;
  error_text: string | null;
};

// Untyped chainable for tables not yet in generated types.
type AnySb = { from: (t: string) => any }; // eslint-disable-line @typescript-eslint/no-explicit-any

export default async function AggregatorInboxPage() {
  const { user, tenant } = await getActiveTenant();
  const role = await getTenantRole(user.id, tenant.id);

  const admin = createAdminClient() as unknown as AnySb;
  const since24h = new Date(Date.now() - 24 * 3600 * 1000).toISOString();

  const [received, applied, failed, jobsRes] = await Promise.all([
    admin
      .from('aggregator_email_jobs')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', tenant.id)
      .gte('received_at', since24h),
    admin
      .from('aggregator_email_jobs')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', tenant.id)
      .eq('status', 'APPLIED')
      .gte('received_at', since24h),
    admin
      .from('aggregator_email_jobs')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', tenant.id)
      .eq('status', 'FAILED')
      .gte('received_at', since24h),
    admin
      .from('aggregator_email_jobs')
      .select(
        'id, sender, subject, received_at, status, detected_source, parsed_data, applied_order_id, error_text',
      )
      .eq('tenant_id', tenant.id)
      .order('received_at', { ascending: false })
      .limit(100),
  ]);

  const received24h = (received as { count: number | null }).count ?? 0;
  const applied24h = (applied as { count: number | null }).count ?? 0;
  const failed24h = (failed as { count: number | null }).count ?? 0;
  const jobs = ((jobsRes as { data: Job[] | null }).data ?? []) as Job[];

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold tracking-tight text-zinc-900">
          Inbox preluare email
        </h1>
        <p className="text-sm text-zinc-600">
          Emailurile primite de la Glovo, Wolt și Bolt Food prin redirectul setat în{' '}
          <a
            href="/dashboard/settings/aggregator-intake"
            className="font-medium text-zinc-900 underline underline-offset-2"
          >
            Configurare → Preluare comenzi
          </a>
          .
        </p>
      </header>

      <section className="grid grid-cols-3 gap-3">
        <Stat label="Primite (24h)" value={received24h} />
        <Stat label="Aplicate (24h)" value={applied24h} tone="ok" />
        <Stat label="Eșuate (24h)" value={failed24h} tone="warn" />
      </section>

      <InboxClient tenantId={tenant.id} canEdit={role === 'OWNER'} jobs={jobs} />
    </div>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: 'ok' | 'warn';
}) {
  const toneClass =
    tone === 'ok'
      ? 'text-emerald-700'
      : tone === 'warn'
      ? 'text-rose-700'
      : 'text-zinc-900';
  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
      <div className="text-xs font-medium text-zinc-500">{label}</div>
      <div className={`mt-1 text-2xl font-semibold tracking-tight ${toneClass}`}>{value}</div>
    </div>
  );
}
