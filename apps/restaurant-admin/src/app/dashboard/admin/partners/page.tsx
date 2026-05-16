// Platform-admin-only: Reseller Partner Program
// Gate: HIR_PLATFORM_ADMIN_EMAILS env var (comma-separated). MVP — replace
// with a proper platform_admins table lookup once a partner portal is built.

import { redirect } from 'next/navigation';
import { createServerClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { isPlatformAdminEmail } from '@/lib/auth/platform-admin';
import { PartnersClient } from './partners-client';

export const dynamic = 'force-dynamic';

type Partner = {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  status: string;
  default_commission_pct: number;
  created_at: string;
  referral_count: number;
  commission_this_month_cents: number;
};

type Commission = {
  id: string;
  partner_id: string;
  period_start: string;
  period_end: string;
  amount_cents: number;
  status: string;
  paid_at: string | null;
  paid_via: string | null;
};

type PendingByMonth = {
  partner_id: string;
  period_month: string; // YYYY-MM-01
  amount_cents: number;
};

type Payout = {
  id: string;
  partner_id: string;
  period_month: string;
  gross_cents: number;
  platform_fee_cents: number;
  net_cents: number;
  paid_at: string;
  paid_by_email: string | null;
  proof_url: string | null;
  notes: string | null;
  voided_at: string | null;
};

export default async function PartnersPage() {
  // ── Auth + platform-admin gate ──────────────────────────────
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user?.email) redirect('/login');

  if (!isPlatformAdminEmail(user.email)) {
    return (
      <div className="rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
        Acces interzis: această pagină este rezervată administratorilor HIR.
      </div>
    );
  }

  // ── Fetch data via service-role client ──────────────────────
  const admin = createAdminClient() as unknown as {
    from: (t: string) => {
      select: (cols: string) => Promise<{
        data: Record<string, unknown>[] | null;
        error: { message: string } | null;
      }>;
    };
  };

  const { data: rawPartners, error } = await admin.from('partners').select(
    'id, name, email, phone, status, default_commission_pct, created_at',
  );

  if (error) {
    return (
      <div className="rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
        Eroare la încărcarea partenerilor: {error.message}
      </div>
    );
  }

  const { data: rawReferrals } = await admin
    .from('partner_referrals')
    .select('partner_id, id');

  const { data: rawCommissions } = await admin
    .from('partner_commissions')
    .select('id, partner_id, amount_cents, period_start, period_end, status, paid_at, paid_via');

  const { data: rawPayouts } = await admin
    .from('partner_payouts')
    .select(
      'id, partner_id, period_month, gross_cents, platform_fee_cents, net_cents, paid_at, paid_by_user_id, proof_url, notes, voided_at',
    );

  // ── Aggregate client-side (no reporting view yet) ────────────
  const now = new Date();
  const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;

  const referralsByPartner: Record<string, number> = {};
  for (const r of rawReferrals ?? []) {
    const pid = r.partner_id as string;
    referralsByPartner[pid] = (referralsByPartner[pid] ?? 0) + 1;
  }

  const commissionsByPartner: Record<string, number> = {};
  for (const c of rawCommissions ?? []) {
    const pid = c.partner_id as string;
    const ps = c.period_start as string;
    const status = c.status as string;
    if (status !== 'VOID' && ps >= monthStart) {
      commissionsByPartner[pid] =
        (commissionsByPartner[pid] ?? 0) + Number(c.amount_cents ?? 0);
    }
  }

  const partners: Partner[] = (rawPartners ?? []).map((p) => ({
    id: p.id as string,
    name: p.name as string,
    email: p.email as string,
    phone: (p.phone as string | null) ?? null,
    status: p.status as string,
    default_commission_pct: Number(p.default_commission_pct),
    created_at: p.created_at as string,
    referral_count: referralsByPartner[p.id as string] ?? 0,
    commission_this_month_cents: commissionsByPartner[p.id as string] ?? 0,
  }));

  const commissions: Commission[] = (rawCommissions ?? []).map((c) => ({
    id: c.id as string,
    partner_id: c.partner_id as string,
    period_start: c.period_start as string,
    period_end: c.period_end as string,
    amount_cents: Number(c.amount_cents ?? 0),
    status: c.status as string,
    paid_at: (c.paid_at as string | null) ?? null,
    paid_via: (c.paid_via as string | null) ?? null,
  }));

  // ── Pending-by-month: aggregate PENDING commissions per partner+month.
  // period_start is always first-of-month from the cron, so we can reuse
  // it directly as the period_month key for partner_payouts matching.
  const pendingByMonthMap = new Map<string, PendingByMonth>();
  for (const c of commissions) {
    if (c.status !== 'PENDING') continue;
    const key = `${c.partner_id}__${c.period_start}`;
    const prev = pendingByMonthMap.get(key);
    if (prev) {
      prev.amount_cents += c.amount_cents;
    } else {
      pendingByMonthMap.set(key, {
        partner_id: c.partner_id,
        period_month: c.period_start,
        amount_cents: c.amount_cents,
      });
    }
  }
  // Drop months that already have an active payout row.
  for (const p of rawPayouts ?? []) {
    if (p.voided_at) continue;
    const key = `${p.partner_id as string}__${p.period_month as string}`;
    pendingByMonthMap.delete(key);
  }
  const pendingByMonth = Array.from(pendingByMonthMap.values()).sort(
    (a, b) => b.period_month.localeCompare(a.period_month),
  );

  // ── Resolve paid_by_user_id → email for the history table.
  const paidByUserIds = Array.from(
    new Set(
      (rawPayouts ?? [])
        .map((p) => p.paid_by_user_id as string | null)
        .filter((u): u is string => Boolean(u)),
    ),
  );
  let userEmailById: Record<string, string> = {};
  if (paidByUserIds.length > 0) {
    try {
      // admin.auth.admin.getUserById exists on the service-role client.
      // We bypass the typed wrapper since auth admin isn't in the cast above.
      const adminAuth = createAdminClient() as unknown as {
        auth: { admin: { getUserById: (id: string) => Promise<{ data: { user: { email?: string | null } | null } }> } };
      };
      const lookups = await Promise.all(
        paidByUserIds.map(async (uid) => {
          try {
            const r = await adminAuth.auth.admin.getUserById(uid);
            return [uid, r.data.user?.email ?? null] as const;
          } catch {
            return [uid, null] as const;
          }
        }),
      );
      userEmailById = Object.fromEntries(
        lookups.filter(([, e]) => e).map(([uid, e]) => [uid, e as string]),
      );
    } catch {
      // best-effort enrichment
    }
  }

  const payouts: Payout[] = (rawPayouts ?? []).map((p) => ({
    id: p.id as string,
    partner_id: p.partner_id as string,
    period_month: p.period_month as string,
    gross_cents: Number(p.gross_cents ?? 0),
    platform_fee_cents: Number(p.platform_fee_cents ?? 0),
    net_cents: Number(p.net_cents ?? 0),
    paid_at: p.paid_at as string,
    paid_by_email: userEmailById[p.paid_by_user_id as string] ?? null,
    proof_url: (p.proof_url as string | null) ?? null,
    notes: (p.notes as string | null) ?? null,
    voided_at: (p.voided_at as string | null) ?? null,
  })).sort((a, b) => b.paid_at.localeCompare(a.paid_at));

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold tracking-tight text-zinc-900">
          Program Parteneri
        </h1>
        <p className="text-sm text-zinc-600">
          Parteneri de vânzări HIR — urmărește referrals și comisioane.
          Vizibil doar administratorilor de platformă.
        </p>
      </header>
      <PartnersClient
        partners={partners}
        commissions={commissions}
        pendingByMonth={pendingByMonth}
        payouts={payouts}
      />
    </div>
  );
}
