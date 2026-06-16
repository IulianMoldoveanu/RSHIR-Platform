// /fleet/deletions — account-deletion requests from this fleet's couriers.
// A fleet manager can approve/reject ONLY if a platform admin granted the
// fleet can_approve_deletions; otherwise the list is read-only.

import { requireFleetManager } from '@/lib/fleet-manager';
import { createAdminClientUntyped } from '@/lib/supabase/admin';
import { DeletionRequestsList, type DeletionRow } from '@/app/admin/deletions/_client';

export const dynamic = 'force-dynamic';

type Raw = {
  id: string;
  courier_user_id: string;
  email: string;
  status: DeletionRow['status'];
  requested_at: string;
  scheduled_purge_at: string | null;
};

export default async function FleetDeletionsPage() {
  const ctx = await requireFleetManager();

  const sb = createAdminClientUntyped();

  const { data: fleet } = await sb
    .from('courier_fleets')
    .select('can_approve_deletions')
    .eq('id', ctx.fleetId)
    .maybeSingle();
  const canDecide = fleet?.can_approve_deletions === true;

  const { data: raw, error } = await sb
    .from('courier_account_deletion_requests')
    .select('id, courier_user_id, email, status, requested_at, scheduled_purge_at')
    .eq('fleet_id', ctx.fleetId)
    .order('requested_at', { ascending: false })
    .limit(200);

  if (error) {
    return (
      <p className="text-sm text-rose-400">Eroare la încărcarea cererilor: {error.message}</p>
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

  const rows: DeletionRow[] = rawRows.map((r) => ({
    id: r.id,
    courier_name: nameMap[r.courier_user_id] ?? null,
    email: r.email,
    fleet_name: null,
    status: r.status,
    requested_at: r.requested_at,
    scheduled_purge_at: r.scheduled_purge_at,
  }));

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-5">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-hir-fg">Cereri de ștergere cont</h1>
        <p className="mt-0.5 text-sm text-hir-muted-fg">
          {canDecide
            ? 'Poți aproba sau respinge cererile curierilor tăi. Datele se păstrează 30 de zile.'
            : 'Vizualizare. Aprobarea ștergerilor se face de platformă (cere permisiune dacă vrei să aprobi tu).'}
        </p>
      </div>
      <DeletionRequestsList rows={rows} canDecide={canDecide} />
    </div>
  );
}
