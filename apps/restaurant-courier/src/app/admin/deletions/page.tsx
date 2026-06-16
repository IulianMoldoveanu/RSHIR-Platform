// /admin/deletions — courier account-deletion requests + fleet approval perms.
// PLATFORM_ADMIN only.

import { requirePlatformAdmin } from '@/lib/platform-admin';
import { createAdminClientUntyped } from '@/lib/supabase/admin';
import {
  DeletionRequestsList,
  FleetApprovalPermissions,
  type DeletionRow,
} from './_client';

export const dynamic = 'force-dynamic';

type Raw = {
  id: string;
  courier_user_id: string;
  email: string;
  fleet_id: string | null;
  status: DeletionRow['status'];
  requested_at: string;
  scheduled_purge_at: string | null;
  courier_fleets: { name: string } | { name: string }[] | null;
};

function one<T>(v: T | T[] | null | undefined): T | null {
  if (Array.isArray(v)) return v[0] ?? null;
  return v ?? null;
}

export default async function AdminDeletionsPage() {
  await requirePlatformAdmin();

  const sb = createAdminClientUntyped();

  const { data: raw, error } = await sb
    .from('courier_account_deletion_requests')
    .select(
      'id, courier_user_id, email, fleet_id, status, requested_at, scheduled_purge_at, courier_fleets(name)',
    )
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
    fleet_name: one(r.courier_fleets)?.name ?? null,
    status: r.status,
    requested_at: r.requested_at,
    scheduled_purge_at: r.scheduled_purge_at,
  }));

  const { data: fleets } = await sb
    .from('courier_fleets')
    .select('id, name, can_approve_deletions')
    .order('name', { ascending: true });

  const pendingCount = rows.filter((r) => r.status === 'PENDING').length;

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-hir-fg">Cereri de ștergere cont</h1>
        <p className="mt-0.5 text-sm text-hir-muted-fg">
          {pendingCount} în așteptare · datele se păstrează 30 de zile după aprobare
        </p>
      </div>

      <section>
        <h2 className="mb-3 text-[11px] font-semibold uppercase tracking-wide text-hir-muted-fg">
          Permisiuni manageri flotă
        </h2>
        <p className="mb-3 text-xs text-hir-muted-fg">
          Activează pentru ca managerul unei flote să poată aproba/respinge ștergerile curierilor
          săi. Platform-admin poate aproba oricum.
        </p>
        <FleetApprovalPermissions
          fleets={
            (fleets ?? []) as { id: string; name: string; can_approve_deletions: boolean }[]
          }
        />
      </section>

      <section>
        <h2 className="mb-3 text-[11px] font-semibold uppercase tracking-wide text-hir-muted-fg">
          Cereri
        </h2>
        <DeletionRequestsList rows={rows} canDecide />
      </section>
    </div>
  );
}
