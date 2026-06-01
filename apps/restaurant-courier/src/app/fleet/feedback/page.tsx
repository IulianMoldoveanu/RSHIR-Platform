// /fleet/feedback — suggestions + bug reports from this fleet's couriers.
// Fleet managers own the support relationship (Phase 0 of the support model).

import { requireFleetManager } from '@/lib/fleet-manager';
import { createAdminClient } from '@/lib/supabase/admin';
import { FeedbackList, type FeedbackRow } from '@/components/feedback-list';

export const dynamic = 'force-dynamic';

type Raw = {
  id: string;
  courier_user_id: string;
  kind: 'SUGGESTION' | 'BUG';
  message: string;
  status: FeedbackRow['status'];
  platform: string | null;
  created_at: string;
};

export default async function FleetFeedbackPage() {
  const ctx = await requireFleetManager();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = createAdminClient() as any;

  const { data: raw, error } = await sb
    .from('courier_feedback')
    .select('id, courier_user_id, kind, message, status, platform, created_at')
    .eq('fleet_id', ctx.fleetId)
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
    fleet_name: null,
  }));

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-5">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-hir-fg">Feedback curieri</h1>
        <p className="mt-0.5 text-sm text-hir-muted-fg">
          Sugestii și probleme de la curierii flotei tale
        </p>
      </div>
      <FeedbackList rows={rows} />
    </div>
  );
}
