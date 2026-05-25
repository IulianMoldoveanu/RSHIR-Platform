// Platform-admin HIR Connect onboarding — flips an existing tenant into
// headless mode and provisions the webhook endpoint + signing secret.
// Wraps the /api/admin/v1/connect/onboard route with a UI so the admin
// doesn't need curl.

import { redirect } from 'next/navigation';
import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import { createServerClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { isPlatformAdminEmail } from '@/lib/auth/platform-admin';
import { ConnectOnboardClient, type TenantOption } from './client';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type TenantRow = {
  id: string;
  name: string;
  slug: string;
  delivery_mode: 'full_saas' | 'headless' | null;
};

export default async function PlatformAdminConnectOnboardPage() {
  const supa = await createServerClient();
  const {
    data: { user },
  } = await supa.auth.getUser();
  if (!user) redirect('/login?next=/dashboard/admin/onboard/connect');

  if (!isPlatformAdminEmail(user.email)) {
    return (
      <div className="rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
        Acces interzis: doar administratorii platformei pot onboarda tenanți HIR Connect.
      </div>
    );
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any;
  const { data: tenantsData } = await admin
    .from('tenants')
    .select('id, name, slug, delivery_mode')
    .eq('status', 'ACTIVE')
    .order('name', { ascending: true });

  const tenants: TenantOption[] = ((tenantsData ?? []) as TenantRow[]).map((t) => ({
    id: t.id,
    name: t.name,
    slug: t.slug,
    deliveryMode: t.delivery_mode ?? 'full_saas',
  }));

  return (
    <div className="flex flex-col gap-6">
      <nav className="flex items-center gap-1 text-xs text-zinc-500" aria-label="Breadcrumb">
        <Link href="/dashboard/admin/onboard" className="hover:text-zinc-800">
          Onboarding
        </Link>
        <ChevronRight className="h-3.5 w-3.5" />
        <span className="font-medium text-zinc-900">HIR Connect</span>
      </nav>

      <header className="flex flex-col gap-1">
        <div className="text-xs font-medium uppercase tracking-wide text-indigo-700">
          Admin · HIR Connect onboarding
        </div>
        <h1 className="text-xl font-semibold tracking-tight text-zinc-900">
          Activează HIR Connect pentru un restaurant
        </h1>
        <p className="text-sm text-zinc-600">
          Pentru restaurante cu site propriu de comenzi (deliveryhouse.ro etc.).
          Selectează tenant-ul, introdu URL-ul webhook al site-ului lor, apoi
          dai signing secret-ul (afișat o singură dată) patronului. Restaurantul
          va apărea în dashboard cu badge-ul &bdquo;HIR Connect&rdquo; și sidebar
          restricționat (fără storefront).
        </p>
      </header>

      <div className="rounded-md border border-indigo-200 bg-indigo-50 px-4 py-3 text-sm text-indigo-900">
        <p className="font-medium">Workflow rapid</p>
        <ol className="mt-1 ml-4 list-decimal space-y-0.5 text-xs text-indigo-800">
          <li>Selectează un tenant existent (creat din ecranul &bdquo;Tenant nou&rdquo; dacă nu există).</li>
          <li>Introdu URL-ul webhook al site-ului lor (https://).</li>
          <li>Salvează signing secret-ul afișat o singură dată; trimite-l către patron.</li>
          <li>Trimite link-ul plugin-ului WordPress dacă folosesc WP.</li>
        </ol>
      </div>

      <ConnectOnboardClient tenants={tenants} />
    </div>
  );
}
