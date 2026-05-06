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

// Lane EMAIL-REGEX-WIREUP — sum cost_savings_ron from parsed_data on the
// month-to-date window. We page through the rows so the tile keeps an
// honest number even on busy tenants. Codex P2 #315: at 200 jobs/24h the
// theoretical monthly max is ~6000; a single 2000-row select silently
// under-reports. Paging at 1000/page worst-case = 6 round-trips/month.
const SAVINGS_PAGE_SIZE = 1000;
const SAVINGS_MAX_PAGES = 8; // hard ceiling — ~8000 rows, > tenant cap

function monthStartISO(now = new Date()): string {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
}

function sumSavingsRon(jobs: Array<{ parsed_data: Record<string, unknown> | null }>): number {
  let total = 0;
  for (const j of jobs) {
    const v = j.parsed_data?.['cost_savings_ron'];
    if (typeof v === 'number' && Number.isFinite(v) && v > 0) total += v;
  }
  // Round to 2 decimals — the tile shows RON to 2 dp.
  return Math.round(total * 100) / 100;
}

async function fetchMonthSavings(
  admin: AnySb,
  tenantId: string,
  sinceMonth: string,
): Promise<number> {
  let total = 0;
  for (let page = 0; page < SAVINGS_MAX_PAGES; page++) {
    const from = page * SAVINGS_PAGE_SIZE;
    const to = from + SAVINGS_PAGE_SIZE - 1;
    const res = await admin
      .from('aggregator_email_jobs')
      .select('parsed_data')
      .eq('tenant_id', tenantId)
      .gte('received_at', sinceMonth)
      .order('received_at', { ascending: false })
      .range(from, to);
    const rows = ((res as { data: Array<{ parsed_data: Record<string, unknown> | null }> | null })
      .data ?? []) as Array<{ parsed_data: Record<string, unknown> | null }>;
    if (rows.length === 0) break;
    total += sumSavingsRon(rows);
    if (rows.length < SAVINGS_PAGE_SIZE) break; // last page reached
  }
  return Math.round(total * 100) / 100;
}

export default async function AggregatorInboxPage() {
  const { user, tenant } = await getActiveTenant();
  const role = await getTenantRole(user.id, tenant.id);

  const admin = createAdminClient() as unknown as AnySb;
  const since24h = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const sinceMonth = monthStartISO();

  const [received, applied, failed, jobsRes, savingsMonthRon] = await Promise.all([
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
    fetchMonthSavings(admin, tenant.id, sinceMonth),
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

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Primite (24h)" value={received24h} />
        <Stat label="Aplicate (24h)" value={applied24h} tone="ok" />
        <Stat label="Eșuate (24h)" value={failed24h} tone="warn" />
        <Stat
          label="Economie AI (luna aceasta)"
          value={savingsMonthRon.toFixed(2).replace('.', ',') + ' RON'}
          tone="ok"
          hint="Cât ați economisit folosind extracția automată cu regex în locul AI complet."
        />
      </section>

      <InboxClient tenantId={tenant.id} canEdit={role === 'OWNER'} jobs={jobs} />
    </div>
  );
}

function Stat({
  label,
  value,
  tone,
  hint,
}: {
  label: string;
  value: number | string;
  tone?: 'ok' | 'warn';
  hint?: string;
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
      {hint && <div className="mt-1 text-[11px] leading-snug text-zinc-500">{hint}</div>}
    </div>
  );
}
