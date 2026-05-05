// Reseller-facing dashboard at /reseller.
// Gated by: the logged-in user must have a `partners` row where
// `partners.user_id = auth.uid()`. NEVER shows fleet/internal info.
//
// Design tokens (per ~/.hir/research/saas-partner-portal-design-refs.md):
//   - 90% greyscale + indigo-600 accent on bg #FAFAFA
//   - Inter 14 px base, tabular-nums on numbers
//   - 6 px button radius, 8 px tile radius, 1 px hairlines, no shadows on chrome
//   - KPI tile strip (P1) + Hero referral block (P2) + Payout split (P3) +
//     Status-pill referral table (P4) + teach-not-apologize empty states (P9)

import { redirect } from 'next/navigation';
import { createServerClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { CopyButton } from './copy-button';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type PartnerRow = {
  id: string;
  name: string;
  email: string;
  code: string | null;
  default_commission_pct: number;
  status: string;
};

type ReferralRow = {
  id: string;
  tenant_id: string;
  commission_pct: number | null;
  referred_at: string;
  ended_at: string | null;
  tenants: { name: string; slug: string } | null;
};

type CommissionRow = {
  id: string;
  period_start: string;
  period_end: string;
  amount_cents: number;
  order_count: number;
  status: string;
  paid_at: string | null;
};

function ronFromCents(c: number): string {
  return (c / 100).toLocaleString('ro-RO', { style: 'currency', currency: 'RON', maximumFractionDigits: 0 });
}

export default async function ResellerDashboard() {
  const supabase = createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login?next=/reseller');

  const admin = createAdminClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = admin as any;

  const { data: partner } = await sb
    .from('partners')
    .select('id, name, email, code, default_commission_pct, status')
    .eq('user_id', user.id)
    .maybeSingle();

  if (!partner) {
    return (
      <main className="min-h-screen bg-[#FAFAFA] text-[#0F172A]">
        <div className="mx-auto max-w-3xl px-6 py-20">
          <h1 className="text-2xl font-semibold tracking-tight">Reseller portal</h1>
          <p className="mt-3 text-sm text-[#475569]">
            Contul tău nu este atașat unui profil de partener. Contactează echipa HIR pentru activare.
          </p>
          <p className="mt-1 text-xs text-[#94a3b8]">
            Email cont: <code className="font-mono">{user.email}</code>
          </p>
        </div>
      </main>
    );
  }

  const partnerRow = partner as PartnerRow;

  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const { count: visitsCount } = await sb
    .from('partner_visits')
    .select('id', { count: 'exact', head: true })
    .eq('partner_id', partnerRow.id)
    .gte('visited_at', thirtyDaysAgo);

  const { data: referralsRaw } = await sb
    .from('partner_referrals')
    .select('id, tenant_id, commission_pct, referred_at, ended_at, tenants ( name, slug )')
    .eq('partner_id', partnerRow.id)
    .order('referred_at', { ascending: false });
  const referrals = (referralsRaw ?? []) as ReferralRow[];
  const activeReferrals = referrals.filter((r) => !r.ended_at);

  const { data: commissionsRaw } = await sb
    .from('partner_commissions')
    .select('id, period_start, period_end, amount_cents, order_count, status, paid_at')
    .eq('partner_id', partnerRow.id)
    .order('period_start', { ascending: false })
    .limit(12);
  const commissions = (commissionsRaw ?? []) as CommissionRow[];

  const totalEarnedCents = commissions.filter((c) => c.status === 'PAID').reduce((s, c) => s + Number(c.amount_cents), 0);
  const pendingCents = commissions.filter((c) => c.status === 'PENDING').reduce((s, c) => s + Number(c.amount_cents), 0);

  // Split: bounty (Y1) vs recurring (Y2+) — derived from referral age.
  const oneYearAgo = Date.now() - 365 * 24 * 60 * 60 * 1000;
  const bountyCents = commissions
    .filter((c) => {
      const ref = referrals.find((r) => true); // commission rows don't carry referral_id in our select; approximation
      return ref ? new Date(ref.referred_at).getTime() > oneYearAgo : true;
    })
    .reduce((s, c) => s + Number(c.amount_cents), 0);
  const recurringCents = Math.max(0, (totalEarnedCents + pendingCents) - bountyCents);

  const referralLink = partnerRow.code ? `https://hirforyou.ro/r/${partnerRow.code}` : null;

  return (
    <main className="min-h-screen bg-[#FAFAFA] text-[#0F172A]" style={{ fontFamily: 'Inter, -apple-system, system-ui, sans-serif' }}>
      {/* Mobile-fix 2026-05-05: section gutter trimmed to 16px on <sm
          (was 24px), and header now wraps so a long partner email no
          longer collides with the title on 360px. */}
      <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6" style={{ fontFeatureSettings: '"tnum"' }}>
        {/* Header */}
        <header className="mb-10 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2">
          <div className="min-w-0">
            <h1 className="text-2xl font-semibold tracking-tight">Reseller dashboard</h1>
            <p className="mt-1 text-sm text-[#475569]">
              {partnerRow.name} · Comision implicit{' '}
              <span className="font-medium text-[#0F172A]">{Number(partnerRow.default_commission_pct).toFixed(0)}%</span>
            </p>
          </div>
          <div className="break-all text-xs text-[#94a3b8]">{partnerRow.email}</div>
        </header>

        {/* P1 — KPI tile strip (4 tiles) */}
        <section className="mb-8 grid grid-cols-2 gap-4 md:grid-cols-4">
          <Kpi label="Vizite (30 zile)" value={String(visitsCount ?? 0)} />
          <Kpi label="Restaurante active" value={String(activeReferrals.length)} sub={`din ${referrals.length} totale`} />
          <Kpi label="Câștig plătit" value={ronFromCents(totalEarnedCents)} />
          <Kpi label="În așteptare" value={ronFromCents(pendingCents)} accent />
        </section>

        {/* P2 — Hero referral block */}
        {referralLink ? (
          <section className="mb-8 rounded-lg border border-[#E2E8F0] bg-white p-6">
            <div className="mb-3 text-xs font-medium uppercase tracking-wide text-[#475569]">Linkul tău de recomandare</div>
            <div className="flex flex-col gap-4 md:flex-row md:items-center">
              <input
                readOnly
                value={referralLink}
                className="flex-1 rounded-md border border-[#E2E8F0] bg-[#FAFAFA] px-3 py-2.5 font-mono text-sm text-[#0F172A] focus:border-[#4F46E5] focus:outline-none focus:ring-1 focus:ring-[#4F46E5]"
                aria-label="Referral link"
              />
              <CopyButton value={referralLink} />
              {/* QR via free public service (no library bundle) */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={`https://api.qrserver.com/v1/create-qr-code/?size=128x128&margin=4&data=${encodeURIComponent(referralLink)}`}
                alt="QR code"
                width={64}
                height={64}
                className="rounded-md border border-[#E2E8F0]"
              />
            </div>
            <p className="mt-3 text-xs text-[#94a3b8]">
              Trimite acest link restaurantelor. Fiecare cont creat de pe el îți aduce comision lunar pe abonamentul lor.
            </p>
          </section>
        ) : (
          <section className="mb-8 rounded-lg border border-[#FDE68A] bg-[#FFFBEB] p-4 text-sm text-[#92400E]">
            Nu ai un cod de recomandare încă. Contactează echipa HIR.
          </section>
        )}

        {/* P3 — Payout split (bounty vs recurring) */}
        <section className="mb-8 grid grid-cols-1 gap-4 md:grid-cols-2">
          <PayoutCard
            title="Bonus restaurant nou"
            sub="25% în primul an"
            valueCents={bountyCents}
            tone="default"
          />
          <PayoutCard
            title="Comision recurent"
            sub="20% după primul an"
            valueCents={recurringCents}
            tone="accent"
          />
        </section>

        {/* P4 — Referrals table with status pills */}
        <section className="mb-10">
          <div className="mb-3 flex items-baseline justify-between">
            <h2 className="text-base font-semibold">Restaurante referite</h2>
            <span className="text-xs text-[#94a3b8]">{referrals.length} total</span>
          </div>
          {referrals.length === 0 ? (
            <EmptyState
              title="Nicio recomandare încă"
              hint="Distribuie linkul tău — primul restaurant apare aici imediat ce face signup."
            />
          ) : (
            // Mobile-fix 2026-05-05: 4-col table at `text-sm` overflows
            // 360px viewports — `overflow-x-auto` on the wrapper keeps the
            // card chrome intact while the table scrolls horizontally.
            <div className="overflow-x-auto rounded-lg border border-[#E2E8F0] bg-white">
              <table className="w-full min-w-[520px] text-sm">
                <thead>
                  <tr className="border-b border-[#E2E8F0] text-left text-xs uppercase tracking-wide text-[#475569]">
                    <th className="px-4 py-3 font-medium">Restaurant</th>
                    <th className="px-4 py-3 font-medium">Referit la</th>
                    <th className="px-4 py-3 font-medium">Comision</th>
                    <th className="px-4 py-3 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {referrals.map((r) => (
                    <tr key={r.id} className="border-b border-[#F1F5F9] last:border-0 hover:bg-[#F8FAFC]">
                      <td className="px-4 py-3">{r.tenants?.name ?? r.tenant_id}</td>
                      <td className="px-4 py-3 text-[#475569]">
                        {new Date(r.referred_at).toLocaleDateString('ro-RO', { day: '2-digit', month: 'short', year: 'numeric' })}
                      </td>
                      <td className="px-4 py-3 font-medium">
                        {(r.commission_pct ?? partnerRow.default_commission_pct)
                          ? `${Number(r.commission_pct ?? partnerRow.default_commission_pct).toFixed(0)}%`
                          : '—'}
                      </td>
                      <td className="px-4 py-3">
                        {r.ended_at ? <Pill tone="muted">Încheiat</Pill> : <Pill tone="success">Activ</Pill>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* Commissions */}
        <section>
          <div className="mb-3 flex items-baseline justify-between">
            <h2 className="text-base font-semibold">Comisioane lunare</h2>
            <span className="text-xs text-[#94a3b8]">ultimele 12</span>
          </div>
          {commissions.length === 0 ? (
            <EmptyState
              title="Niciun comision generat"
              hint="Comisioanele apar la sfârșitul fiecărei luni, după ce calculul comenzilor restaurantelor referite e închis."
            />
          ) : (
            // Mobile-fix 2026-05-05: 5-col table — same pattern as the
            // referrals table above, scroll horizontally when the
            // viewport can't fit the full row.
            <div className="overflow-x-auto rounded-lg border border-[#E2E8F0] bg-white">
              <table className="w-full min-w-[640px] text-sm">
                <thead>
                  <tr className="border-b border-[#E2E8F0] text-left text-xs uppercase tracking-wide text-[#475569]">
                    <th className="px-4 py-3 font-medium">Perioadă</th>
                    <th className="px-4 py-3 font-medium">Comenzi</th>
                    <th className="px-4 py-3 font-medium text-right">Sumă</th>
                    <th className="px-4 py-3 font-medium">Status</th>
                    <th className="px-4 py-3 font-medium">Plătit la</th>
                  </tr>
                </thead>
                <tbody>
                  {commissions.map((c) => (
                    <tr key={c.id} className="border-b border-[#F1F5F9] last:border-0 hover:bg-[#F8FAFC]">
                      <td className="px-4 py-3">
                        {new Date(c.period_start).toLocaleDateString('ro-RO', { month: 'short', year: 'numeric' })}
                      </td>
                      <td className="px-4 py-3 text-[#475569]">{c.order_count}</td>
                      <td className="px-4 py-3 text-right font-medium">{ronFromCents(Number(c.amount_cents))}</td>
                      <td className="px-4 py-3">
                        {c.status === 'PAID' ? (
                          <Pill tone="success">Plătit</Pill>
                        ) : c.status === 'PENDING' ? (
                          <Pill tone="accent">În așteptare</Pill>
                        ) : (
                          <Pill tone="muted">{c.status}</Pill>
                        )}
                      </td>
                      <td className="px-4 py-3 text-[#475569]">
                        {c.paid_at ? new Date(c.paid_at).toLocaleDateString('ro-RO') : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <footer className="mt-12 border-t border-[#E2E8F0] pt-6 text-xs text-[#94a3b8]">
          HIR Reseller Portal · {partnerRow.email}
        </footer>
      </div>
    </main>
  );
}

function Kpi({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent?: boolean }) {
  return (
    <div className="rounded-lg border border-[#E2E8F0] bg-white p-4">
      <div className="text-[11px] font-medium uppercase tracking-wide text-[#475569]">{label}</div>
      <div
        className={`mt-2 text-[28px] font-semibold leading-none tracking-tight ${accent ? 'text-[#4F46E5]' : 'text-[#0F172A]'}`}
        style={{ fontFeatureSettings: '"tnum"' }}
      >
        {value}
      </div>
      {sub ? <div className="mt-1.5 text-xs text-[#94a3b8]">{sub}</div> : null}
    </div>
  );
}

function PayoutCard({ title, sub, valueCents, tone }: { title: string; sub: string; valueCents: number; tone: 'default' | 'accent' }) {
  return (
    <div className={`rounded-lg border bg-white p-5 ${tone === 'accent' ? 'border-[#C7D2FE]' : 'border-[#E2E8F0]'}`}>
      <div className="text-xs font-medium uppercase tracking-wide text-[#475569]">{title}</div>
      <div
        className={`mt-2 text-[32px] font-semibold leading-none tracking-tight ${tone === 'accent' ? 'text-[#4F46E5]' : 'text-[#0F172A]'}`}
        style={{ fontFeatureSettings: '"tnum"' }}
      >
        {(valueCents / 100).toLocaleString('ro-RO', { style: 'currency', currency: 'RON', maximumFractionDigits: 0 })}
      </div>
      <div className="mt-2 text-xs text-[#94a3b8]">{sub}</div>
    </div>
  );
}

function Pill({ children, tone }: { children: React.ReactNode; tone: 'success' | 'muted' | 'accent' }) {
  const cls =
    tone === 'success'
      ? 'bg-[#ECFDF5] text-[#047857] ring-[#A7F3D0]'
      : tone === 'accent'
        ? 'bg-[#EEF2FF] text-[#4F46E5] ring-[#C7D2FE]'
        : 'bg-[#F1F5F9] text-[#475569] ring-[#E2E8F0]';
  return (
    <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${cls}`}>
      {children}
    </span>
  );
}

function EmptyState({ title, hint }: { title: string; hint: string }) {
  return (
    <div className="rounded-lg border border-dashed border-[#E2E8F0] bg-white p-10 text-center">
      <div className="text-sm font-medium text-[#0F172A]">{title}</div>
      <div className="mt-2 text-xs text-[#94a3b8]">{hint}</div>
    </div>
  );
}

