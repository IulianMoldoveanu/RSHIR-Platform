import { createAdminClient } from '@/lib/supabase/admin';
import { getActiveTenant, getTenantRole } from '@/lib/tenant';
import { SeoClient } from './seo-client';
import type { SeoSettings } from './actions';

export const dynamic = 'force-dynamic';

export default async function SeoSettingsPage() {
  const { user, tenant } = await getActiveTenant();
  const role = await getTenantRole(user.id, tenant.id);

  const admin = createAdminClient();
  const { data } = await admin
    .from('tenants')
    .select('settings')
    .eq('id', tenant.id)
    .maybeSingle();
  const settings = (data?.settings as Record<string, unknown> | null) ?? {};

  const initial: SeoSettings = {
    cuisine: typeof settings.cuisine === 'string' ? settings.cuisine : null,
    meta_description:
      typeof settings.meta_description === 'string' ? settings.meta_description : null,
  };

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold tracking-tight text-zinc-900">SEO</h1>
        <p className="text-sm text-zinc-600">
          Configurări pentru indexarea în Google. Tipul de bucătărie apare în
          structured data, descrierea apare ca meta description pe pagina de
          start a {tenant.name}.
        </p>
      </header>

      {role !== 'OWNER' && (
        <div className="rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          Doar utilizatorii cu rolul <strong>OWNER</strong> pot modifica setările
          SEO.
        </div>
      )}

      <SeoClient initial={initial} canEdit={role === 'OWNER'} tenantId={tenant.id} />
    </div>
  );
}
