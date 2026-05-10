// Lane U — Support inbox for platform admins.
// Reads public.support_messages via service-role; gated by HIR_PLATFORM_ADMIN_EMAILS.

import { redirect } from 'next/navigation';
import { createServerClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { SupportInboxClient } from './client';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type SupportRow = {
  id: string;
  tenant_id: string | null;
  email: string | null;
  category: string | null;
  message: string;
  status: string;
  admin_note: string | null;
  ip: string | null;
  user_agent: string | null;
  created_at: string;
  resolved_at: string | null;
};

const STATUSES = ['NEW', 'IN_PROGRESS', 'RESPONDED', 'RESOLVED', 'SPAM'] as const;
type Status = (typeof STATUSES)[number];

function isStatus(v: string | undefined): v is Status {
  return typeof v === 'string' && (STATUSES as readonly string[]).includes(v);
}

export default async function SupportInboxPage(
  props: {
    searchParams: Promise<{ status?: string; category?: string }>;
  }
) {
  const searchParams = await props.searchParams;
  const supa = await createServerClient();
  const { data: { user } } = await supa.auth.getUser();
  if (!user) redirect('/login?next=/dashboard/admin/support');

  const allow = (process.env.HIR_PLATFORM_ADMIN_EMAILS ?? '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  if (!user.email || !allow.includes(user.email.toLowerCase())) {
    return (
      <main className="min-h-screen bg-[#FAFAFA] p-10 text-[#0F172A]">
        <div className="mx-auto max-w-2xl">
          <h1 className="text-2xl font-semibold">Acces interzis</h1>
          <p className="mt-2 text-sm text-[#475569]">
            Doar administratorii platformei pot vedea inbox-ul de suport.
          </p>
        </div>
      </main>
    );
  }

  const status: Status = isStatus(searchParams.status) ? searchParams.status : 'NEW';
  const category = searchParams.category && searchParams.category !== 'ALL' ? searchParams.category : null;

  const admin = createAdminClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let q: any = (admin as any)
    .from('support_messages')
    .select(
      'id, tenant_id, email, category, message, status, admin_note, ip, user_agent, created_at, resolved_at',
    )
    .eq('status', status)
    .order('created_at', { ascending: false })
    .limit(100);
  if (category) q = q.eq('category', category);

  const { data: rowsRaw, error } = await q;
  if (error) {
    return (
      <main className="min-h-screen bg-[#FAFAFA] p-10 text-[#0F172A]">
        <div className="mx-auto max-w-2xl">
          <h1 className="text-2xl font-semibold">Eroare la încărcarea inbox-ului</h1>
          <p className="mt-2 text-sm text-[#B91C1C]">{error.message}</p>
        </div>
      </main>
    );
  }
  const rows = (rowsRaw ?? []) as SupportRow[];

  // Counts per status, for the tab badges
  const counts: Record<Status, number> = {
    NEW: 0,
    IN_PROGRESS: 0,
    RESPONDED: 0,
    RESOLVED: 0,
    SPAM: 0,
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: countRows } = await (admin as any)
    .from('support_messages')
    .select('status')
    .limit(2000);
  if (Array.isArray(countRows)) {
    for (const r of countRows as Array<{ status: string }>) {
      if (isStatus(r.status)) counts[r.status]++;
    }
  }

  return (
    <main className="min-h-screen bg-[#FAFAFA] px-6 py-8 text-[#0F172A]">
      <div className="mx-auto max-w-5xl">
        <header className="mb-6">
          <h1 className="text-2xl font-semibold">Inbox suport</h1>
          <p className="mt-1 text-sm text-[#475569]">
            Mesaje primite prin panoul „Suport HIR” de pe storefront-ul public.
          </p>
        </header>

        <div className="mb-4 flex flex-wrap items-center gap-2">
          {STATUSES.map((s) => {
            const active = s === status;
            const params = new URLSearchParams();
            params.set('status', s);
            if (category) params.set('category', category);
            return (
              <a
                key={s}
                href={`?${params.toString()}`}
                className={`rounded-full px-3 py-1.5 text-xs font-medium ${
                  active
                    ? 'bg-[#7c3aed] text-white'
                    : 'border border-[#E2E8F0] bg-white text-[#475569] hover:bg-[#F8FAFC]'
                }`}
              >
                {s.replace('_', ' ')}{' '}
                <span className={active ? 'opacity-90' : 'text-[#94a3b8]'}>({counts[s]})</span>
              </a>
            );
          })}
        </div>

        <div className="mb-4 flex flex-wrap items-center gap-2 text-xs">
          <span className="text-[#94a3b8]">Categorie:</span>
          {['ALL', 'ORDER', 'PAYMENT', 'ACCOUNT', 'OTHER'].map((c) => {
            const active = (c === 'ALL' && !category) || c === category;
            const params = new URLSearchParams();
            params.set('status', status);
            if (c !== 'ALL') params.set('category', c);
            return (
              <a
                key={c}
                href={`?${params.toString()}`}
                className={`rounded px-2 py-1 ${
                  active ? 'bg-[#0F172A] text-white' : 'bg-white text-[#475569] hover:bg-[#F1F5F9]'
                }`}
              >
                {c}
              </a>
            );
          })}
        </div>

        <SupportInboxClient rows={rows} />
      </div>
    </main>
  );
}
