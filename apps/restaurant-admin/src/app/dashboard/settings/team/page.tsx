import { createAdminClient } from '@/lib/supabase/admin';
import { getActiveTenant, getTenantRole } from '@/lib/tenant';
import { TeamClient } from './team-client';

export const dynamic = 'force-dynamic';

export type TeamMember = {
  user_id: string;
  email: string | null;
  role: 'OWNER' | 'STAFF';
  can_manage_zones: boolean;
};

export default async function TeamSettingsPage() {
  const { user, tenant } = await getActiveTenant();
  const role = await getTenantRole(user.id, tenant.id);
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
    members = rawRows.map((r) => ({
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

      {role !== 'OWNER' && (
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
    </div>
  );
}
