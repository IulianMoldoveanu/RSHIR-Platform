import { createAdminClient } from '@/lib/supabase/admin';
import { getActiveTenant } from '@/lib/tenant';

async function getRawRoleForPage(
  userId: string,
  tenantId: string,
): Promise<'OWNER' | 'STAFF' | 'FLEET_MANAGER' | null> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from('tenant_members')
    .select('role')
    .eq('user_id', userId)
    .eq('tenant_id', tenantId)
    .maybeSingle();
  if (error || !data) return null;
  if (data.role === 'OWNER') return 'OWNER';
  if (data.role === 'FLEET_MANAGER') return 'FLEET_MANAGER';
  return 'STAFF';
}
import { TeamClient } from './team-client';
import { FleetManagerInviteSection } from './fm-invite-section';
import { listFmMembers, listPendingFmInvites } from './fm-invite-actions';
import {
  PairingNoteOwnerSection,
  PairingNoteFmSection,
  type PairingNoteRow,
} from './pairing-note-section';

export const dynamic = 'force-dynamic';

export type TeamMember = {
  user_id: string;
  email: string | null;
  role: 'OWNER' | 'STAFF';
  can_manage_zones: boolean;
};

type FmPairingDataset = {
  rows: PairingNoteRow[];
  selfRow: PairingNoteRow | null;
};

async function loadFmPairingData(tenantId: string): Promise<FmPairingDataset> {
  const admin = createAdminClient();
  // Pairing-note columns land in migration 20260507_010 and aren't yet
  // in the generated supabase types. Cast through any so tsc accepts.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = admin as any;
  const { data, error } = await sb
    .from('tenant_members')
    .select(
      'user_id, role, note_from_fleet, note_from_owner, note_from_fleet_updated_at, note_from_owner_updated_at, fm_phone',
    )
    .eq('tenant_id', tenantId)
    .eq('role', 'FLEET_MANAGER');
  if (error) {
    console.error('[team] pairing notes load failed', error.message);
    return { rows: [], selfRow: null };
  }
  type Raw = {
    user_id: string;
    role: string;
    note_from_fleet: string | null;
    note_from_owner: string | null;
    note_from_fleet_updated_at: string | null;
    note_from_owner_updated_at: string | null;
    fm_phone: string | null;
  };
  const raw = (data ?? []) as Raw[];
  if (raw.length === 0) return { rows: [], selfRow: null };

  const ids = raw.map((r) => r.user_id);
  const emailById = new Map<string, string | null>();
  try {
    const { data: usersData } = await admin.auth.admin.listUsers({
      page: 1,
      perPage: 200,
    });
    for (const u of usersData.users) {
      if (ids.includes(u.id)) emailById.set(u.id, u.email ?? null);
    }
  } catch (e) {
    console.error('[team] pairing notes email lookup failed', e);
  }

  const rows: PairingNoteRow[] = raw.map((r) => ({
    user_id: r.user_id,
    email: emailById.get(r.user_id) ?? null,
    note_from_fleet: r.note_from_fleet,
    note_from_owner: r.note_from_owner,
    note_from_fleet_updated_at: r.note_from_fleet_updated_at,
    note_from_owner_updated_at: r.note_from_owner_updated_at,
    fm_phone: r.fm_phone,
  }));
  rows.sort((a, b) =>
    (a.email ?? '').localeCompare(b.email ?? '', 'ro', { sensitivity: 'base' }),
  );

  return { rows, selfRow: null };
}

async function loadTenantContactPhone(tenantId: string): Promise<string | null> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from('tenants')
    .select('settings')
    .eq('id', tenantId)
    .maybeSingle();
  if (error || !data) return null;
  const settings = (data.settings ?? {}) as Record<string, unknown>;
  const phone = settings.contact_phone;
  return typeof phone === 'string' && phone.trim().length > 0
    ? phone.trim()
    : null;
}

export default async function TeamSettingsPage() {
  const { user, tenant } = await getActiveTenant();
  // We need to distinguish FLEET_MANAGER from STAFF (the shared
  // getTenantRole helper collapses both into 'STAFF'), so do a raw
  // lookup. OWNER/STAFF view uses the legacy role token; FLEET_MANAGER
  // falls through to the non-OWNER read-only banner via `role !== 'OWNER'`.
  const rawRole = await getRawRoleForPage(user.id, tenant.id);
  const role: 'OWNER' | 'STAFF' | null =
    rawRole === 'OWNER' ? 'OWNER' : rawRole === null ? null : 'STAFF';
  const admin = createAdminClient();

  // can_manage_zones is added in migration 20260603_001 and is not yet in
  // the generated @hir/supabase-types union; the codegen runs after the
  // migration applies. Cast through unknown so tsc treats the column as
  // an opaque string the runtime simply forwards.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: rows, error } = await (admin.from('tenant_members') as any)
    .select('user_id, role, can_manage_zones')
    .eq('tenant_id', tenant.id);

  let members: TeamMember[] = [];
  let loadError: string | null = null;
  if (error) {
    loadError = 'Nu am putut încărca lista membrilor.';
    console.error('[team] members list failed', {
      tenantId: tenant.id,
      message: (error as { message?: string }).message,
    });
  } else {
    type RawRow = { user_id: string; role: string; can_manage_zones?: boolean };
    const rawRows = (rows ?? []) as unknown as RawRow[];
    const userIds = rawRows.map((r) => r.user_id);
    const emailById = new Map<string, string | null>();
    if (userIds.length > 0) {
      // auth.admin.listUsers returns the full user list; for small teams
      // (typical: 1–10 members per tenant) this is fine. Pagination kicks
      // in past 200 — revisit when tenants approach that.
      try {
        const { data } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
        for (const u of data.users) {
          if (userIds.includes(u.id)) emailById.set(u.id, u.email ?? null);
        }
      } catch (e) {
        console.error('[team] email lookup failed', e);
      }
    }
    members = rawRows
      .filter((r) => r.role === 'OWNER' || r.role === 'STAFF')
      .map((r) => ({
        user_id: r.user_id,
        email: emailById.get(r.user_id) ?? null,
        role: r.role === 'OWNER' ? 'OWNER' : 'STAFF',
        can_manage_zones: Boolean(r.can_manage_zones),
      }));
    members.sort((a, b) => {
      if (a.role !== b.role) return a.role === 'OWNER' ? -1 : 1;
      return (a.email ?? '').localeCompare(b.email ?? '');
    });
  }

  // Pairing notes — only render if there's an FM relationship. OWNER
  // sees the per-FM section; the FM logged into this tenant sees their
  // own coordination panel.
  const pairing =
    rawRole === 'OWNER' || rawRole === 'FLEET_MANAGER'
      ? await loadFmPairingData(tenant.id)
      : { rows: [], selfRow: null };
  const selfRow =
    rawRole === 'FLEET_MANAGER'
      ? pairing.rows.find((r) => r.user_id === user.id) ?? null
      : null;
  const ownerContactPhone =
    rawRole === 'FLEET_MANAGER'
      ? await loadTenantContactPhone(tenant.id)
      : null;

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold tracking-tight text-zinc-900">
          Echipă
        </h1>
        <p className="text-sm text-zinc-600">
          Lista persoanelor cu acces la acest restaurant și permisiunile lor.
          Doar OWNER poate schimba permisiunile.
        </p>
      </header>

      {rawRole !== 'OWNER' && rawRole !== 'FLEET_MANAGER' && (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Vezi membrii dar nu poți modifica permisiunile. Doar OWNER are dreptul.
        </div>
      )}

      {loadError && (
        <div className="rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          {loadError}
        </div>
      )}

      <TeamClient members={members} canEdit={role === 'OWNER'} tenantId={tenant.id} />

      {role === 'OWNER' && (
        <FleetManagerInviteSection
          tenantId={tenant.id}
          tenantName={tenant.name}
          fleetManagers={await listFmMembers(tenant.id)}
          pendingInvites={await listPendingFmInvites(tenant.id)}
        />
      )}

      {rawRole === 'OWNER' && pairing.rows.length > 0 && (
        <PairingNoteOwnerSection tenantId={tenant.id} rows={pairing.rows} />
      )}

      {rawRole === 'FLEET_MANAGER' && selfRow && (
        <PairingNoteFmSection
          tenantId={tenant.id}
          ownerPhone={ownerContactPhone}
          ownerNote={selfRow.note_from_owner}
          ownerNoteUpdatedAt={selfRow.note_from_owner_updated_at}
          initialFleetNote={selfRow.note_from_fleet}
          initialFmPhone={selfRow.fm_phone}
        />
      )}
    </div>
  );
}
