// Platform-admin-only: Feedback Dashboard
// Lists every feedback_reports row across all tenants, ordered by created_at
// DESC. Gate via HIR_PLATFORM_ADMIN_EMAILS (mirrors /dashboard/admin/partners).
// Capability-table gate ships in P1.5.

import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createServerClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

type Row = {
  id: string;
  tenant_id: string | null;
  category: string;
  severity: string | null;
  status: string;
  description: string;
  url: string | null;
  screenshot_path: string | null;
  created_at: string;
  tenants: { slug: string | null; name: string | null } | null;
};

const CATEGORY_LABEL: Record<string, string> = {
  BUG: 'Eroare',
  UX_FRICTION: 'Sugestie UX',
  FEATURE_REQUEST: 'Cerere',
  QUESTION: 'Întrebare',
};

const STATUS_LABEL: Record<string, string> = {
  NEW: 'Nou',
  TRIAGED: 'Triat',
  FIX_ATTEMPTED: 'Fix încercat',
  FIX_PROPOSED: 'PR propus',
  FIX_AUTO_MERGED: 'Auto-merged',
  HUMAN_FIX_NEEDED: 'Necesită fix manual',
  RESOLVED: 'Rezolvat',
  DUPLICATE: 'Duplicat',
  REJECTED: 'Respins',
};

function fmtRelative(iso: string): string {
  const d = new Date(iso);
  const diffMs = Date.now() - d.getTime();
  const m = Math.round(diffMs / 60000);
  if (m < 1) return 'acum';
  if (m < 60) return `${m} min`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h`;
  const days = Math.round(h / 24);
  return `${days} z`;
}

export default async function FeedbackDashboardPage() {
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

  // feedback_reports lands in supabase-types after the generator next runs;
  // until then we cast to a minimal query shape (mirrors the partners page).
  const admin = createAdminClient() as unknown as {
    from: (t: string) => {
      select: (cols: string) => {
        order: (
          col: string,
          opts: { ascending: boolean },
        ) => {
          limit: (n: number) => Promise<{
            data: Record<string, unknown>[] | null;
            error: { message: string } | null;
          }>;
        };
      };
    };
  };
  const { data, error } = await admin
    .from('feedback_reports')
    .select(
      'id, tenant_id, category, severity, status, description, url, ' +
        'screenshot_path, created_at, tenants:tenant_id ( slug, name )',
    )
    .order('created_at', { ascending: false })
    .limit(200);

  if (error) {
    return (
      <div className="rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
        Eroare la încărcare: {error.message}
      </div>
    );
  }

  const rows = (data ?? []) as unknown as Row[];

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold tracking-tight text-zinc-900">
          Feedback de la vendori
        </h1>
        <p className="text-sm text-zinc-600">
          Bugs, sugestii și întrebări trimise direct din admin. Vizibil doar
          administratorilor de platformă.
        </p>
      </header>

      {rows.length === 0 ? (
        <div className="rounded-md border border-zinc-200 bg-white px-4 py-8 text-center text-sm text-zinc-500">
          Niciun raport încă.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-md border border-zinc-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-zinc-50 text-left text-xs uppercase tracking-wide text-zinc-500">
              <tr>
                <th className="px-3 py-2 font-medium">Tenant</th>
                <th className="px-3 py-2 font-medium">Categorie</th>
                <th className="px-3 py-2 font-medium">Status</th>
                <th className="px-3 py-2 font-medium">Descriere</th>
                <th className="px-3 py-2 font-medium">Captură</th>
                <th className="px-3 py-2 font-medium">Acum</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {rows.map((r) => (
                <tr key={r.id} className="hover:bg-zinc-50">
                  <td className="px-3 py-2 font-medium text-zinc-900">
                    {r.tenants?.slug ?? '—'}
                  </td>
                  <td className="px-3 py-2 text-zinc-700">
                    {CATEGORY_LABEL[r.category] ?? r.category}
                  </td>
                  <td className="px-3 py-2 text-zinc-700">
                    {STATUS_LABEL[r.status] ?? r.status}
                  </td>
                  <td className="max-w-md truncate px-3 py-2 text-zinc-700">
                    {r.description}
                  </td>
                  <td className="px-3 py-2 text-zinc-500">
                    {r.screenshot_path ? 'da' : '—'}
                  </td>
                  <td className="px-3 py-2 text-zinc-500">
                    {fmtRelative(r.created_at)}
                  </td>
                  <td className="px-3 py-2">
                    <Link
                      href={`/dashboard/feedback/${r.id}`}
                      className="text-purple-700 hover:underline"
                    >
                      Deschide
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
