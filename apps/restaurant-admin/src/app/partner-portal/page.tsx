// Partner self-serve portal — main dashboard page.
// Auth is handled by layout.tsx; by the time we reach this page the user is
// guaranteed to have an active partners row.

import { redirect } from 'next/navigation';
import { createServerClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { InvitePanel } from './_components/invite-panel';
import { ProfileForm } from './_components/profile-form';

export const dynamic = 'force-dynamic';

// ────────────────────────────────────────────────────────────
// Types (partner tables not yet in generated DB types)
// ────────────────────────────────────────────────────────────

type Partner = {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  default_commission_pct: number;
  status: string;
  code: string | null;
};

type Referral = {
  id: string;
  tenant_name: string;
  referred_at: string;
  commission_pct: number | null;
  ended_at: string | null;
};

type Commission = {
  id: string;
  period_start: string;
  period_end: string;
  amount_cents: number;
  order_count: number;
  status: string;
  paid_at: string | null;
};

// Service-role client cast — partners tables not in generated types.
type AdminClient = {
  from: (table: string) => {
    select: (cols: string) => {
      eq: (col: string, val: string) => {
        in: (col: string, vals: string[]) => {
          maybeSingle: () => Promise<{ data: Record<string, unknown> | null; error: { message: string } | null }>;
        };
        eq: (col: string, val: string) => {
          maybeSingle: () => Promise<{ data: Record<string, unknown> | null; error: { message: string } | null }>;
        };
        order: (col: string, opts: { ascending: boolean }) => {
          limit: (n: number) => Promise<{ data: Record<string, unknown>[] | null; error: { message: string } | null }>;
        };
        limit: (n: number) => Promise<{ data: Record<string, unknown>[] | null; error: { message: string } | null }>;
      };
    };
  };
};

function centsToRon(cents: number): string {
  return (cents / 100).toLocaleString('ro-RO', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('ro-RO', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

// ────────────────────────────────────────────────────────────
// Page
// ────────────────────────────────────────────────────────────

export default async function PartnerPortalPage() {
  const supabase = createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const admin = createAdminClient() as unknown as AdminClient;

  // 1. Partner row
  // Lane T: include PENDING partners — they need access to the dashboard
  // immediately to share their /r/<code> link, even before admin approval.
  const { data: rawPartner } = await admin
    .from('partners')
    .select('id, name, email, phone, default_commission_pct, status, code')
    .eq('user_id', user.id)
    .in('status', ['PENDING', 'ACTIVE'])
    .maybeSingle();

  if (!rawPartner) redirect('/login');

  const partner: Partner = {
    id: rawPartner.id as string,
    name: rawPartner.name as string,
    email: rawPartner.email as string,
    phone: (rawPartner.phone as string | null) ?? null,
    default_commission_pct: Number(rawPartner.default_commission_pct),
    status: String(rawPartner.status ?? 'PENDING'),
    code: (rawPartner.code as string | null) ?? null,
  };

  const isPending = partner.status === 'PENDING';

  // 2. Referrals (up to 50 rows, newest first)
  //    We join tenants to get the name. The cast works because we call .select()
  //    with an embedded relation — Supabase returns it as a nested object.
  type RawReferral = {
    id: string;
    referred_at: string;
    commission_pct: number | null;
    ended_at: string | null;
    tenants: { name: string } | null;
  };

  const { data: rawReferrals } = await (
    admin
      .from('partner_referrals')
      .select('id, referred_at, commission_pct, ended_at, tenants:tenants(name)')
      .eq('partner_id', partner.id) as unknown as {
        order: (col: string, opts: { ascending: boolean }) => {
          limit: (n: number) => Promise<{ data: RawReferral[] | null; error: unknown }>;
        };
      }
  )
    .order('referred_at', { ascending: false })
    .limit(50);

  const referrals: Referral[] = (rawReferrals ?? []).map((r) => ({
    id: r.id,
    tenant_name: r.tenants?.name ?? '—',
    referred_at: r.referred_at,
    commission_pct: r.commission_pct,
    ended_at: r.ended_at,
  }));

  // 3. Commissions — last 24 rows (2 years of monthly rows), newest first
  type RawCommission = {
    id: string;
    period_start: string;
    period_end: string;
    amount_cents: number;
    order_count: number;
    status: string;
    paid_at: string | null;
  };

  const { data: rawCommissions } = await (
    admin
      .from('partner_commissions')
      .select('id, period_start, period_end, amount_cents, order_count, status, paid_at')
      .eq('partner_id', partner.id) as unknown as {
        order: (col: string, opts: { ascending: boolean }) => {
          limit: (n: number) => Promise<{ data: RawCommission[] | null; error: unknown }>;
        };
      }
  )
    .order('period_start', { ascending: false })
    .limit(24);

  const commissions: Commission[] = (rawCommissions ?? []).map((c) => ({
    id: c.id,
    period_start: c.period_start,
    period_end: c.period_end,
    amount_cents: Number(c.amount_cents),
    order_count: c.order_count,
    status: c.status,
    paid_at: c.paid_at,
  }));

  // 4. KPI aggregates
  const now = new Date();
  const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;

  const currentMonthCents = commissions
    .filter((c) => c.status !== 'VOID' && c.period_start >= monthStart)
    .reduce((sum, c) => sum + c.amount_cents, 0);

  const allTimePaidCents = commissions
    .filter((c) => c.status === 'PAID')
    .reduce((sum, c) => sum + c.amount_cents, 0);

  // 5. Referral URL — prefer the public /r/<code> landing on the storefront
  // host (white-label friendly, has visit tracking + cookie attribution).
  // Fall back to the admin signup path for legacy partners without a code.
  const webUrl =
    process.env.NEXT_PUBLIC_RESTAURANT_WEB_URL ?? 'https://hir-restaurant-web.vercel.app';
  const primaryDomain = process.env.NEXT_PUBLIC_PRIMARY_DOMAIN ?? 'hiraisolutions.ro';
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? `https://app.${primaryDomain}`;
  const referralUrl = partner.code
    ? `${webUrl}/r/${partner.code}`
    : `${appUrl}/signup?ref=${partner.id}`;

  return (
    <div className="flex flex-col gap-8">
      {/* Header */}
      <header className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold tracking-tight text-zinc-900">
          Bună, {partner.name}
        </h1>
        <p className="text-sm text-zinc-500">
          Comisionul tău implicit:{' '}
          <span className="font-medium text-zinc-700">
            {partner.default_commission_pct.toFixed(2)}%
          </span>
        </p>
      </header>

      {/* Lane T: status banner — only shown when partner is PENDING */}
      {isPending ? (
        <div
          role="status"
          aria-live="polite"
          className="rounded-lg border border-amber-300 bg-amber-50 p-4"
        >
          <div className="flex items-start gap-3">
            <span
              aria-hidden
              className="mt-0.5 inline-flex h-5 w-5 flex-none items-center justify-center rounded-full bg-amber-200 text-xs font-bold text-amber-900"
            >
              !
            </span>
            <div>
              <h2 className="text-sm font-semibold text-amber-900">
                Cerere în curs de aprobare
              </h2>
              <p className="mt-1 text-sm text-amber-800">
                Vei putea încasa comision după aprobarea echipei HIR. Estimat 24h. Între timp,
                poți deja distribui linkul tău — atribuirea referralurilor se păstrează retroactiv.
              </p>
            </div>
          </div>
        </div>
      ) : null}

      {/* KPI tiles */}
      <section aria-label="Indicatori cheie" className="grid gap-4 sm:grid-cols-3">
        <KpiTile
          label="Restaurante referite"
          value={String(referrals.length)}
          sub="total activ"
        />
        <KpiTile
          label="Comision luna curentă"
          value={`${centsToRon(currentMonthCents)} RON`}
          sub="PENDING + PAID"
        />
        <KpiTile
          label="Comision plătit (total)"
          value={`${centsToRon(allTimePaidCents)} RON`}
          sub="toate perioadele"
        />
      </section>

      {/* Invite link panel */}
      <InvitePanel referralUrl={referralUrl} />

      {/* Referrals table */}
      <section aria-label="Restaurante referite">
        <h2 className="mb-3 text-sm font-semibold text-zinc-900">Restaurante referite</h2>
        {referrals.length === 0 ? (
          <EmptyState text="0 RON câștigați · 0 restaurante referite — începe prin a distribui linkul tău mai sus." />
        ) : (
          <div className="overflow-x-auto rounded-lg border border-zinc-200 bg-white">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-200 bg-zinc-50 text-xs text-zinc-500">
                  <th className="px-4 py-2 text-left font-medium">Restaurant</th>
                  <th className="px-4 py-2 text-left font-medium">Dată referral</th>
                  <th className="px-4 py-2 text-right font-medium">Comision %</th>
                  <th className="px-4 py-2 text-left font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {referrals.map((r) => {
                  const effectivePct = r.commission_pct ?? partner.default_commission_pct;
                  const isActive = !r.ended_at || new Date(r.ended_at) > now;
                  return (
                    <tr key={r.id} className="hover:bg-zinc-50">
                      <td className="px-4 py-3 font-medium text-zinc-900">{r.tenant_name}</td>
                      <td className="px-4 py-3 text-zinc-600">{fmtDate(r.referred_at)}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-zinc-700">
                        {effectivePct.toFixed(2)}%
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={
                            isActive
                              ? 'inline-flex rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-800'
                              : 'inline-flex rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-600'
                          }
                        >
                          {isActive ? 'Activă' : 'Încheiată'}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Commissions table */}
      <section aria-label="Comisioane">
        <h2 className="mb-3 text-sm font-semibold text-zinc-900">Comisioane (ultimele 24 luni)</h2>
        {commissions.length === 0 ? (
          <EmptyState text="Nu există comisioane înregistrate încă." />
        ) : (
          <div className="overflow-x-auto rounded-lg border border-zinc-200 bg-white">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-200 bg-zinc-50 text-xs text-zinc-500">
                  <th className="px-4 py-2 text-left font-medium">Perioadă</th>
                  <th className="px-4 py-2 text-right font-medium">Comenzi</th>
                  <th className="px-4 py-2 text-right font-medium">Valoare</th>
                  <th className="px-4 py-2 text-left font-medium">Status</th>
                  <th className="px-4 py-2 text-left font-medium">Plătit la</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {commissions.map((c) => (
                  <tr key={c.id} className="hover:bg-zinc-50">
                    <td className="px-4 py-3 text-zinc-700">
                      {fmtDate(c.period_start)} — {fmtDate(c.period_end)}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-zinc-600">
                      {c.order_count}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums font-medium text-zinc-900">
                      {centsToRon(c.amount_cents)} RON
                    </td>
                    <td className="px-4 py-3">
                      <CommissionStatusBadge status={c.status} />
                    </td>
                    <td className="px-4 py-3 text-zinc-500 text-xs">
                      {c.paid_at ? fmtDate(c.paid_at) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Profile settings */}
      <section aria-label="Setări profil">
        <h2 className="mb-3 text-sm font-semibold text-zinc-900">Profilul tău</h2>
        <ProfileForm
          initialName={partner.name}
          initialPhone={partner.phone ?? ''}
          email={partner.email}
        />
      </section>
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// Small presentational helpers (server-safe, no hooks)
// ────────────────────────────────────────────────────────────

function KpiTile({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="rounded-lg border border-zinc-200 bg-white px-5 py-4">
      <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums text-zinc-900">{value}</p>
      <p className="mt-0.5 text-xs text-zinc-400">{sub}</p>
    </div>
  );
}

function CommissionStatusBadge({ status }: { status: string }) {
  const cls =
    status === 'PAID'
      ? 'bg-emerald-100 text-emerald-800'
      : status === 'VOID'
        ? 'bg-zinc-100 text-zinc-500'
        : 'bg-amber-100 text-amber-700';
  const label =
    status === 'PAID' ? 'PLĂTIT' : status === 'VOID' ? 'ANULAT' : 'ÎN AȘTEPTARE';
  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${cls}`}>
      {label}
    </span>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="rounded-lg border border-dashed border-zinc-300 bg-white px-6 py-8 text-center">
      <p className="text-sm text-zinc-500">{text}</p>
    </div>
  );
}
