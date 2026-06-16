// /admin/feedback — all courier suggestions + bug reports. PLATFORM_ADMIN only.

import { requirePlatformAdmin } from '@/lib/platform-admin';
import { createAdminClientUntyped } from '@/lib/supabase/admin';
import { FeedbackList, type FeedbackRow } from '@/components/feedback-list';

export const dynamic = 'force-dynamic';

type Raw = {
  id: string;
  courier_user_id: string;
  fleet_id: string | null;
  kind: 'SUGGESTION' | 'BUG';
  message: string;
  status: FeedbackRow['status'];
  platform: string | null;
  created_at: string;
  courier_fleets: { name: string } | { name: string }[] | null;
};

function one<T>(v: T | T[] | null | undefined): T | null {
  if (Array.isArray(v)) return v[0] ?? null;
  return v ?? null;
}

export default async function AdminFeedbackPage() {
  await requirePlatformAdmin();

  const sb = createAdminClientUntyped();

  const { data: raw, error } = await sb
    .from('courier_feedback')
    .select(
      'id, courier_user_id, fleet_id, kind, message, status, platform, created_at, courier_fleets(name)',
    )
    .order('created_at', { ascending: false })
    .limit(200);

  if (error) {
    return (
      <p className="text-sm text-rose-400">Eroare la încărcarea feedback-ului: {error.message}</p>
    );
  }

  const rawRows = (raw ?? []) as Raw[];
  const ids = [...new Set(rawRows.map((r) => r.courier_user_id))];
  let nameMap: Record<string, string> = {};
  if (ids.length > 0) {
    const { data: profs } = await sb
      .from('courier_profiles')
      .select('user_id, full_name')
      .in('user_id', ids);
    nameMap = Object.fromEntries(
      ((profs ?? []) as { user_id: string; full_name: string }[]).map((p) => [
        p.user_id,
        p.full_name,
      ]),
    );
  }

  const rows: FeedbackRow[] = rawRows.map((r) => ({
    id: r.id,
    kind: r.kind,
    message: r.message,
    status: r.status,
    platform: r.platform,
    created_at: r.created_at,
    courier_name: nameMap[r.courier_user_id] ?? null,
    fleet_name: one(r.courier_fleets)?.name ?? null,
  }));

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-hir-fg">Feedback curieri</h1>
        <p className="mt-0.5 text-sm text-hir-muted-fg">
          {rows.length} {rows.length === 1 ? 'mesaj' : 'mesaje'} · sugestii și probleme raportate
        </p>
      </div>
      <FeedbackList rows={rows} showFleet />
    </div>
  );
}
