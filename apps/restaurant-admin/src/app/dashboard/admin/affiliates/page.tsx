// Platform-admin review of pending affiliate applications.
// Gated by HIR_PLATFORM_ADMIN_EMAILS env (same as /dashboard/admin/partners).

import { redirect } from 'next/navigation';
import { createServerClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { AffiliatesClient } from './client';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type AppRow = {
  id: string;
  full_name: string;
  email: string;
  phone: string | null;
  audience_type: string;
  audience_size: number | null;
  channels: string[];
  pitch: string;
  status: string;
  created_at: string;
  reviewed_at: string | null;
  reviewer_notes: string | null;
  partner_id: string | null;
  referrer: string | null;
  // PR3 — surfaced to reviewer so the new signup fields actually
  // affect the workflow they were added for.
  also_fleet_manager: boolean;
  network_description: string | null;
};

export default async function AffiliatesPage({
  searchParams,
}: {
  searchParams: { status?: string };
}) {
  const supa = createServerClient();
  const { data: { user } } = await supa.auth.getUser();
  if (!user) redirect('/login?next=/dashboard/admin/affiliates');

  const allow = (process.env.HIR_PLATFORM_ADMIN_EMAILS ?? '')
    .split(',').map((e) => e.trim().toLowerCase()).filter(Boolean);
  if (!user.email || !allow.includes(user.email.toLowerCase())) {
    return (
      <main className="min-h-screen bg-[#FAFAFA] p-10 text-[#0F172A]">
        <div className="mx-auto max-w-2xl">
          <h1 className="text-2xl font-semibold">Acces interzis</h1>
          <p className="mt-2 text-sm text-[#475569]">Doar administratorii platformei pot vedea această pagină.</p>
        </div>
      </main>
    );
  }

  const status = searchParams.status ?? 'PENDING';
  const admin = createAdminClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: rowsRaw } = await (admin as any)
    .from('affiliate_applications')
    .select('id, full_name, email, phone, audience_type, audience_size, channels, pitch, status, created_at, reviewed_at, reviewer_notes, partner_id, referrer, also_fleet_manager, network_description')
    .eq('status', status)
    .order('created_at', { ascending: false })
    .limit(100);
  const rows = (rowsRaw ?? []) as AppRow[];

  // Count by status for tabs
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: countsRaw } = await (admin as any)
    .from('affiliate_applications')
    .select('status', { head: false });
  const counts: Record<string, number> = { PENDING: 0, APPROVED: 0, REJECTED: 0, SPAM: 0 };
  for (const r of (countsRaw ?? []) as Array<{ status: string }>) {
    counts[r.status] = (counts[r.status] ?? 0) + 1;
  }

  return (
    <main className="min-h-screen bg-[#FAFAFA] text-[#0F172A]" style={{ fontFamily: 'Inter, -apple-system, system-ui, sans-serif' }}>
      <div className="mx-auto max-w-5xl px-6 py-10">
        <header className="mb-8 flex items-start justify-between gap-4">
          <div>
            <div className="text-xs font-medium uppercase tracking-wide text-[#475569]">Admin · Program reseller</div>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight">Aplicații reseller</h1>
            <p className="mt-2 text-sm text-[#475569]">
              Aprobă, respinge sau marchează spam. La aprobare se generează automat codul de partener și se trimite email cu codul + link dashboard.
            </p>
          </div>
          <a
            href="/dashboard/admin/affiliates/stats"
            className="inline-flex items-center rounded-md border border-[#E2E8F0] bg-white px-3 py-2 text-xs font-medium text-[#0F172A] hover:bg-[#F8FAFC]"
          >
            Funnel stats →
          </a>
        </header>

        {/* Status tabs */}
        <nav className="mb-6 flex gap-1 border-b border-[#E2E8F0]">
          {(['PENDING', 'APPROVED', 'REJECTED', 'SPAM'] as const).map((s) => (
            <a
              key={s}
              href={`?status=${s}`}
              className={`relative -mb-px border-b-2 px-4 py-2.5 text-sm font-medium ${
                status === s
                  ? 'border-[#4F46E5] text-[#4F46E5]'
                  : 'border-transparent text-[#475569] hover:text-[#0F172A]'
              }`}
            >
              {s.charAt(0) + s.slice(1).toLowerCase()}
              <span className="ml-2 inline-flex items-center rounded bg-[#F1F5F9] px-1.5 py-0.5 text-xs text-[#475569]">
                {counts[s] ?? 0}
              </span>
            </a>
          ))}
        </nav>

        <AffiliatesClient applications={rows} />
      </div>
    </main>
  );
}
