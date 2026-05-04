// Affiliate-program funnel stats — daily applications, approval rate, top
// referrers (the ?ref= attribution slugs Iulian DMs), and bounty pipeline.
//
// Read-only; platform-admin gated identically to ../page.tsx.

import { redirect } from 'next/navigation';
import { createServerClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type AppRow = {
  status: string;
  created_at: string;
  referrer: string | null;
  audience_type: string;
};

type BountyRow = {
  status: string;
  amount_ron: number;
};

function dayKey(iso: string): string {
  return iso.slice(0, 10);
}

export default async function AffiliateStatsPage() {
  const supa = createServerClient();
  const { data: { user } } = await supa.auth.getUser();
  if (!user) redirect('/login?next=/dashboard/admin/affiliates/stats');

  const allow = (process.env.HIR_PLATFORM_ADMIN_EMAILS ?? '')
    .split(',').map((e) => e.trim().toLowerCase()).filter(Boolean);
  if (!user.email || !allow.includes(user.email.toLowerCase())) {
    return (
      <main className="min-h-screen bg-[#FAFAFA] p-10 text-[#0F172A]">
        <div className="mx-auto max-w-2xl">
          <h1 className="text-2xl font-semibold">Acces interzis</h1>
        </div>
      </main>
    );
  }

  const admin = createAdminClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = admin as any;

  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const { data: appsRaw } = await sb
    .from('affiliate_applications')
    .select('status, created_at, referrer, audience_type')
    .gte('created_at', since)
    .order('created_at', { ascending: false });
  const apps = (appsRaw ?? []) as AppRow[];

  const { data: bountiesRaw } = await sb
    .from('affiliate_bounties')
    .select('status, amount_ron');
  const bounties = (bountiesRaw ?? []) as BountyRow[];

  // Funnel totals
  const totalApps = apps.length;
  const approved = apps.filter((a) => a.status === 'APPROVED').length;
  const rejected = apps.filter((a) => a.status === 'REJECTED').length;
  const spam = apps.filter((a) => a.status === 'SPAM').length;
  const pending = apps.filter((a) => a.status === 'PENDING').length;
  const reviewed = approved + rejected;
  const approvalRatePct = reviewed > 0 ? Math.round((approved / reviewed) * 100) : 0;

  // Daily breakdown last 14 days
  const days: { day: string; count: number }[] = [];
  for (let i = 13; i >= 0; i--) {
    const d = new Date(Date.now() - i * 24 * 60 * 60 * 1000);
    days.push({ day: d.toISOString().slice(0, 10), count: 0 });
  }
  for (const a of apps) {
    const d = days.find((x) => x.day === dayKey(a.created_at));
    if (d) d.count += 1;
  }
  const maxDay = Math.max(1, ...days.map((d) => d.count));

  // Top referrers
  const refMap = new Map<string, number>();
  for (const a of apps) {
    if (a.referrer) refMap.set(a.referrer, (refMap.get(a.referrer) ?? 0) + 1);
  }
  const topRefs = Array.from(refMap.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8);

  // Bounty pipeline (RON)
  const bountyByStatus: Record<string, number> = { PENDING: 0, PAYABLE: 0, PAID: 0, CANCELLED: 0 };
  for (const b of bounties) {
    bountyByStatus[b.status] = (bountyByStatus[b.status] ?? 0) + Number(b.amount_ron);
  }

  return (
    <main className="min-h-screen bg-[#FAFAFA] text-[#0F172A]" style={{ fontFamily: 'Inter, -apple-system, system-ui, sans-serif' }}>
      <div className="mx-auto max-w-5xl px-6 py-10" style={{ fontFeatureSettings: '"tnum"' }}>
        <header className="mb-8">
          <a href="/dashboard/admin/affiliates" className="text-xs text-[#475569] underline">← Aplicații</a>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight">Funnel afiliați</h1>
          <p className="mt-2 text-sm text-[#475569]">Ultimele 30 de zile · cifrele cresc în timp real.</p>
        </header>

        {/* Funnel KPIs */}
        <section className="mb-8 grid grid-cols-2 gap-4 md:grid-cols-4">
          <Kpi label="Aplicații (30 zile)" value={String(totalApps)} />
          <Kpi label="În așteptare" value={String(pending)} accent />
          <Kpi label="Aprobate" value={String(approved)} sub={`din ${reviewed} revizuite`} />
          <Kpi label="Rată aprobare" value={`${approvalRatePct}%`} sub={`${rejected} respinse · ${spam} spam`} />
        </section>

        {/* Daily chart (CSS-only bars) */}
        <section className="mb-10 rounded-lg border border-[#E2E8F0] bg-white p-6">
          <h2 className="mb-4 text-base font-semibold">Aplicații pe zi (14 zile)</h2>
          <div className="flex h-32 items-end gap-1.5">
            {days.map((d) => {
              const h = (d.count / maxDay) * 100;
              return (
                <div key={d.day} className="flex flex-1 flex-col items-center gap-1">
                  <div className="w-full text-center text-[10px] tabular-nums text-[#475569]">{d.count || ''}</div>
                  <div
                    className="w-full rounded-sm bg-[#4F46E5]"
                    style={{ height: `${Math.max(h, d.count > 0 ? 4 : 0)}%`, minHeight: d.count > 0 ? 2 : 0 }}
                    title={`${d.day}: ${d.count}`}
                  />
                </div>
              );
            })}
          </div>
          <div className="mt-2 flex justify-between text-[10px] text-[#94a3b8]">
            <span>{days[0].day}</span>
            <span>{days[days.length - 1].day}</span>
          </div>
        </section>

        {/* Top referrers */}
        <section className="mb-10">
          <h2 className="mb-3 text-base font-semibold">Top surse <code className="text-xs text-[#94a3b8]">?ref=</code></h2>
          {topRefs.length === 0 ? (
            <div className="rounded-lg border border-dashed border-[#E2E8F0] bg-white p-6 text-center text-sm text-[#94a3b8]">
              Nicio aplicație cu atribuire <code>?ref=</code> încă. Distribuie linkuri de tip{' '}
              <code className="bg-[#F1F5F9] px-1">/affiliate?ref=iulian</code>.
            </div>
          ) : (
            <div className="overflow-hidden rounded-lg border border-[#E2E8F0] bg-white">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[#E2E8F0] text-left text-xs uppercase tracking-wide text-[#475569]">
                    <th className="px-4 py-3 font-medium">Sursă</th>
                    <th className="px-4 py-3 font-medium text-right">Aplicații</th>
                  </tr>
                </thead>
                <tbody>
                  {topRefs.map(([ref, count]) => (
                    <tr key={ref} className="border-b border-[#F1F5F9] last:border-0">
                      <td className="px-4 py-2.5 font-mono text-xs">{ref}</td>
                      <td className="px-4 py-2.5 text-right font-medium tabular-nums">{count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* Bounty pipeline */}
        <section>
          <h2 className="mb-3 text-base font-semibold">Conducta de bounty (RON)</h2>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            <Kpi label="În așteptare" value={`${bountyByStatus.PENDING.toLocaleString('ro-RO')} RON`} sub="lock 30 zile" />
            <Kpi label="Plătibil" value={`${bountyByStatus.PAYABLE.toLocaleString('ro-RO')} RON`} accent />
            <Kpi label="Plătit" value={`${bountyByStatus.PAID.toLocaleString('ro-RO')} RON`} />
            <Kpi label="Anulat" value={`${bountyByStatus.CANCELLED.toLocaleString('ro-RO')} RON`} />
          </div>
        </section>
      </div>
    </main>
  );
}

function Kpi({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent?: boolean }) {
  return (
    <div className="rounded-lg border border-[#E2E8F0] bg-white p-4">
      <div className="text-[11px] font-medium uppercase tracking-wide text-[#475569]">{label}</div>
      <div
        className={`mt-2 text-[26px] font-semibold leading-none tracking-tight ${accent ? 'text-[#4F46E5]' : 'text-[#0F172A]'}`}
        style={{ fontFeatureSettings: '"tnum"' }}
      >
        {value}
      </div>
      {sub ? <div className="mt-1.5 text-xs text-[#94a3b8]">{sub}</div> : null}
    </div>
  );
}
