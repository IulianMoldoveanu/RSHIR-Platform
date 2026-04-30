// Platform-admin-only: Reseller Partner Program
// Gate: HIR_PLATFORM_ADMIN_EMAILS env var (comma-separated). MVP — replace
// with a proper platform_admins table lookup once a partner portal is built.

import { redirect } from 'next/navigation';
import { createServerClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
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

export default async function PartnersPage() {
  // ── Auth + platform-admin gate ──────────────────────────────
  const supabase = createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user?.email) redirect('/login');

  const allowList = (process.env.HIR_PLATFORM_ADMIN_EMAILS ?? '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);

  if (!allowList.includes(user.email.toLowerCase())) {
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
    .select('partner_id, amount_cents, period_start, status');

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
      <PartnersClient partners={partners} />
    </div>
  );
}
