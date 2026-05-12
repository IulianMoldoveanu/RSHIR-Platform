// Platform-admin Fleet Manager assignment + per-tenant external dispatch config.
// Gated by HIR_PLATFORM_ADMIN_EMAILS env var (same pattern as
// /dashboard/admin/partners and /dashboard/admin/affiliates).
//
// Internal only — merchant UI never references this page.

import { redirect } from 'next/navigation';
import { createServerClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { listActiveCities, type CityRow } from '@/lib/cities';
import { isPlatformAdminEmail } from '@/lib/auth/platform-admin';
import { FleetManagersClient } from './fleet-managers-client';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type TenantRow = {
  id: string;
  slug: string;
  name: string;
  // Lane MULTI-CITY: canonical city slug for filtering. NULL when tenant
  // hasn't been assigned a city yet (legacy free-text in settings only).
  citySlug: string | null;
  cityName: string | null;
  external_dispatch_webhook_url: string | null;
  external_dispatch_enabled: boolean;
  has_secret: boolean;
};

type FleetManagerTenant = {
  id: string;
  name: string;
  slug: string;
  note_from_fleet: string | null;
  note_from_owner: string | null;
  note_from_fleet_updated_at: string | null;
  note_from_owner_updated_at: string | null;
  fm_phone: string | null;
};

type FleetManagerRow = {
  user_id: string;
  email: string;
  tenants: FleetManagerTenant[];
};

export default async function FleetManagersPage(
  props: {
    searchParams?: Promise<{ city?: string }>;
  }
) {
  const searchParams = await props.searchParams;
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) redirect('/login?next=/dashboard/admin/fleet-managers');

  if (!isPlatformAdminEmail(user.email)) {
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

  // ── Cities list (Lane MULTI-CITY) — for the FM filter dropdown ──
  const canonicalCities: CityRow[] = await listActiveCities();
  const cityById = new Map(canonicalCities.map((c) => [c.id, c]));

  // ── Tenants list (with external dispatch flags) ─────────────
  const { data: tenantsRaw, error: tErr } = await sb
    .from('tenants')
    .select('id, slug, name, settings, city_id, external_dispatch_webhook_url, external_dispatch_secret, external_dispatch_enabled')
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

  const collator = new Intl.Collator('ro', { sensitivity: 'base' });
  const tenants: TenantRow[] = (tenantsRaw ?? []).map(
    (t: {
      id: string;
      slug: string;
      name: string;
      settings: Record<string, unknown> | null;
      city_id: string | null;
      external_dispatch_webhook_url: string | null;
      external_dispatch_secret: string | null;
      external_dispatch_enabled: boolean;
    }) => {
      // Lane MULTI-CITY: prefer canonical city, fall back to legacy free-text.
      const canonical = t.city_id ? cityById.get(t.city_id) : undefined;
      let citySlug: string | null = canonical?.slug ?? null;
      let cityName: string | null = canonical?.name ?? null;
      if (!canonical) {
        const legacy =
          typeof t.settings?.city === 'string' ? (t.settings.city as string).trim() : '';
        if (legacy) {
          const match = canonicalCities.find((c) => collator.compare(c.name, legacy) === 0);
          citySlug = match?.slug ?? null;
          cityName = match?.name ?? legacy;
        }
      }
      return {
        id: t.id,
        slug: t.slug,
        name: t.name,
        citySlug,
        cityName,
        external_dispatch_webhook_url: t.external_dispatch_webhook_url,
        external_dispatch_enabled: t.external_dispatch_enabled,
        has_secret: t.external_dispatch_secret !== null,
      };
    },
  );

  // ── Existing FLEET_MANAGER memberships, grouped by user. Pulls the
  //    pairing-note columns (migration 20260507_010) so the platform
  //    admin sees both notes inline for triage. Read-only here — edits
  //    happen from inside the tenant context (OWNER or FM session) at
  //    /dashboard/settings/team.
  const { data: memberships } = await sb
    .from('tenant_members')
    .select(
      'user_id, tenant_id, note_from_fleet, note_from_owner, note_from_fleet_updated_at, note_from_owner_updated_at, fm_phone',
    )
    .eq('role', 'FLEET_MANAGER');

  type RawMembership = {
    user_id: string;
    tenant_id: string;
    note_from_fleet: string | null;
    note_from_owner: string | null;
    note_from_fleet_updated_at: string | null;
    note_from_owner_updated_at: string | null;
    fm_phone: string | null;
  };
  const rawMemberships = (memberships ?? []) as RawMembership[];
  const fmUserIds = Array.from(new Set(rawMemberships.map((m) => m.user_id)));

  // Resolve emails for those user_ids via the Auth admin API. Paginate
  // so we don't miss FMs whose accounts fall on a later page once the
  // project crosses 200 total auth users (Codex P2 #276).
  const emailByUserId = new Map<string, string>();
  if (fmUserIds.length > 0) {
    const remaining = new Set(fmUserIds);
    for (let page = 1; page <= 25 && remaining.size > 0; page++) {
      const { data } = await sb.auth.admin.listUsers({ page, perPage: 200 });
      const users = (data?.users ?? []) as { id: string; email?: string | null }[];
      if (users.length === 0) break;
      for (const u of users) {
        if (remaining.has(u.id) && u.email) {
          emailByUserId.set(u.id, u.email);
          remaining.delete(u.id);
        }
      }
      if (users.length < 200) break;
    }
  }

  const tenantById = new Map(tenants.map((t) => [t.id, t]));
  const fmRows: FleetManagerRow[] = fmUserIds.map((uid) => {
    const tenantsForUser: FleetManagerTenant[] = rawMemberships
      .filter((m) => m.user_id === uid)
      .map((m) => {
        const tenant = tenantById.get(m.tenant_id);
        if (!tenant) return null;
        return {
          id: tenant.id,
          name: tenant.name,
          slug: tenant.slug,
          note_from_fleet: m.note_from_fleet,
          note_from_owner: m.note_from_owner,
          note_from_fleet_updated_at: m.note_from_fleet_updated_at,
          note_from_owner_updated_at: m.note_from_owner_updated_at,
          fm_phone: m.fm_phone,
        };
      })
      .filter((t): t is FleetManagerTenant => Boolean(t));
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

        <FleetManagersClient
          tenants={tenants}
          fleetManagers={fmRows}
          cities={canonicalCities.map((c) => ({ slug: c.slug, name: c.name }))}
          initialCity={searchParams?.city ?? ''}
        />
      </div>
    </main>
  );
}
