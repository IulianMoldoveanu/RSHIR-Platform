// Platform-admin "Add sibling location" wizard.
// Creates a new tenant under an existing brand root + optionally clones
// branding (logo, cover, settings.branding) and the full menu (categories,
// items, modifiers). The OWNER of the root tenant is auto-added as OWNER
// of the new sibling.

import { redirect } from 'next/navigation';
import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import { createServerClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { isPlatformAdminEmail } from '@/lib/auth/platform-admin';
import { SiblingOnboardClient, type RootTenantOption, type CityOption } from './client';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type TenantRow = {
  id: string;
  name: string;
  slug: string;
  parent_brand_id: string | null;
  city_id: string | null;
};

type CityRow = { id: string; name: string };

export default async function PlatformAdminSiblingOnboardPage() {
  const supa = await createServerClient();
  const {
    data: { user },
  } = await supa.auth.getUser();
  if (!user) redirect('/login?next=/dashboard/admin/onboard/sibling');

  if (!isPlatformAdminEmail(user.email)) {
    return (
      <div className="rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
        Acces interzis: doar administratorii platformei pot adăuga locații noi
        sub un brand existent.
      </div>
    );
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any;

  // Only brand ROOTS are valid parents (parent_brand_id IS NULL).
  // Standalone tenants are also roots — selecting one promotes it implicitly.
  const { data: tenantsData } = await admin
    .from('tenants')
    .select('id, name, slug, parent_brand_id, city_id')
    .eq('status', 'ACTIVE')
    .is('parent_brand_id', null)
    .order('name', { ascending: true });

  const roots: RootTenantOption[] = ((tenantsData ?? []) as TenantRow[]).map((t) => ({
    id: t.id,
    name: t.name,
    slug: t.slug,
    cityId: t.city_id,
  }));

  const { data: citiesData } = await admin
    .from('cities')
    .select('id, name')
    .order('name', { ascending: true });

  const cities: CityOption[] = ((citiesData ?? []) as CityRow[]).map((c) => ({
    id: c.id,
    name: c.name,
  }));

  return (
    <div className="flex flex-col gap-6">
      <nav className="flex items-center gap-1 text-xs text-zinc-500" aria-label="Breadcrumb">
        <Link href="/dashboard/admin/onboard" className="hover:text-zinc-800">
          Onboarding
        </Link>
        <ChevronRight className="h-3.5 w-3.5" />
        <span className="font-medium text-zinc-900">Locație nouă (brand existent)</span>
      </nav>

      <header className="flex flex-col gap-1">
        <div className="text-xs font-medium uppercase tracking-wide text-violet-700">
          Admin · Brand multi-locație
        </div>
        <h1 className="text-xl font-semibold tracking-tight text-zinc-900">
          Adaugă locație nouă sub un brand existent
        </h1>
        <p className="text-sm text-zinc-600">
          Pentru restaurante cu mai multe locații fizice (ex: 3 unități în 2
          orașe). Selectează brand-ul părinte, dă nume + slug pentru noua
          locație, alege orașul. Opțional, clonăm meniul și branding-ul de la
          tenantul root.
        </p>
      </header>

      <div className="rounded-md border border-indigo-200 bg-indigo-50 px-4 py-3 text-sm text-indigo-900">
        <p className="font-medium">Cum funcționează</p>
        <ol className="ml-4 mt-1 list-decimal space-y-0.5 text-xs text-indigo-800">
          <li>Selectează tenant-ul root (brand-ul existent).</li>
          <li>Introdu nume + slug + oraș pentru noua locație.</li>
          <li>Bifează &bdquo;Clonează meniul&rdquo; și/sau &bdquo;Clonează branding-ul&rdquo; dacă vrei pornire rapidă.</li>
          <li>Creăm tenantul nou, îl legăm de brand prin <code className="rounded bg-white px-1 font-mono">parent_brand_id</code> și adăugăm același OWNER.</li>
        </ol>
      </div>

      <SiblingOnboardClient roots={roots} cities={cities} />
    </div>
  );
}
