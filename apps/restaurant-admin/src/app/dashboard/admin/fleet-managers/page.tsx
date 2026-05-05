// Platform-admin Fleet Manager assignment + per-tenant external dispatch config.
// Gated by HIR_PLATFORM_ADMIN_EMAILS env var (same pattern as
// /dashboard/admin/partners and /dashboard/admin/affiliates).
//
// Internal only — merchant UI never references this page.

import { redirect } from 'next/navigation';
import { createServerClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { FleetManagersClient } from './fleet-managers-client';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type TenantRow = {
  id: string;
  slug: string;
  name: string;
  external_dispatch_webhook_url: string | null;
  external_dispatch_enabled: boolean;
  has_secret: boolean;
};

type FleetManagerRow = {
  user_id: string;
  email: string;
  tenants: { id: string; name: string; slug: string }[];
};

export default async function FleetManagersPage() {
  const supabase = createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) redirect('/login?next=/dashboard/admin/fleet-managers');

  const allowList = (process.env.HIR_PLATFORM_ADMIN_EMAILS ?? '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);

  if (!allowList.includes(user.email.toLowerCase())) {
    return (
      <main className="min-h-screen bg-zinc-50 p-10">
        <div className="mx-auto max-w-2xl rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          Acces interzis: această pagină este rezervată administratorilor de
          platformă HIR.
        </div>
      </main>
    );
  }

  const admin = createAdminClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = admin as any;

  // ── Tenants list (with external dispatch flags) ─────────────
  const { data: tenantsRaw, error: tErr } = await sb
    .from('tenants')
    .select('id, slug, name, external_dispatch_webhook_url, external_dispatch_secret, external_dispatch_enabled')
    .order('name', { ascending: true });

  if (tErr) {
    return (
      <main className="min-h-screen bg-zinc-50 p-10">
        <div className="mx-auto max-w-2xl rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          Eroare la încărcarea restaurantelor: {tErr.message}
          <p className="mt-2 text-xs text-rose-700">
            Dacă mesajul menționează „external_dispatch”, migrația
            20260506_001 nu a fost încă aplicată.
          </p>
        </div>
      </main>
    );
  }

  const tenants: TenantRow[] = (tenantsRaw ?? []).map(
    (t: {
      id: string;
      slug: string;
      name: string;
      external_dispatch_webhook_url: string | null;
      external_dispatch_secret: string | null;
      external_dispatch_enabled: boolean;
    }) => ({
      id: t.id,
      slug: t.slug,
      name: t.name,
      external_dispatch_webhook_url: t.external_dispatch_webhook_url,
      external_dispatch_enabled: t.external_dispatch_enabled,
      has_secret: t.external_dispatch_secret !== null,
    }),
  );

  // ── Existing FLEET_MANAGER memberships, grouped by user ─────
  const { data: memberships } = await sb
    .from('tenant_members')
    .select('user_id, tenant_id')
    .eq('role', 'FLEET_MANAGER');

  const fmUserIds = Array.from(
    new Set(
      ((memberships ?? []) as { user_id: string; tenant_id: string }[]).map(
        (m) => m.user_id,
      ),
    ),
  );

  // Resolve emails for those user_ids via the Auth admin API.
  const emailByUserId = new Map<string, string>();
  if (fmUserIds.length > 0) {
    // listUsers paginates; FM count is small (<200) at pilot scale.
    const { data: authData } = await sb.auth.admin.listUsers({ page: 1, perPage: 200 });
    for (const u of (authData?.users ?? []) as { id: string; email?: string | null }[]) {
      if (fmUserIds.includes(u.id) && u.email) {
        emailByUserId.set(u.id, u.email);
      }
    }
  }

  const tenantById = new Map(tenants.map((t) => [t.id, t]));
  const fmRows: FleetManagerRow[] = fmUserIds.map((uid) => {
    const tenantsForUser = (
      (memberships ?? []) as { user_id: string; tenant_id: string }[]
    )
      .filter((m) => m.user_id === uid)
      .map((m) => tenantById.get(m.tenant_id))
      .filter((t): t is TenantRow => Boolean(t))
      .map((t) => ({ id: t.id, name: t.name, slug: t.slug }));
    return {
      user_id: uid,
      email: emailByUserId.get(uid) ?? '(email indisponibil)',
      tenants: tenantsForUser,
    };
  });

  return (
    <main className="min-h-screen bg-zinc-50 p-6 sm:p-10">
      <div className="mx-auto max-w-5xl">
        <header className="mb-6">
          <h1 className="text-2xl font-semibold text-zinc-900">
            Fleet Managers
          </h1>
          <p className="mt-1 text-sm text-zinc-600">
            Asociați manageri de flotă cu unul sau mai multe restaurante și
            configurați endpoint-ul webhook pentru dispatch extern.
          </p>
          <p className="mt-1 text-xs text-zinc-500">
            Acest panou este intern. Restaurantele nu văd această pagină și
            nu sunt informate că dispatch-ul este externalizat — văd doar
            „curier HIR”.
          </p>
        </header>

        <FleetManagersClient tenants={tenants} fleetManagers={fmRows} />
      </div>
    </main>
  );
}
