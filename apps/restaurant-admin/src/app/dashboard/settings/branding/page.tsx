import { createAdminClient } from '@/lib/supabase/admin';
import { getActiveTenant, getTenantRole } from '@/lib/tenant';
import { BrandingClient } from './branding-client';
import { DEFAULT_BRAND_COLOR, type BrandingState } from './actions';

export const dynamic = 'force-dynamic';

const HEX_RE = /^#[0-9a-fA-F]{6}$/;

export default async function BrandingSettingsPage() {
  const { user, tenant } = await getActiveTenant();
  const role = await getTenantRole(user.id, tenant.id);

  const admin = createAdminClient();
  const { data } = await admin
    .from('tenants')
    .select('settings')
    .eq('id', tenant.id)
    .maybeSingle();
  const settings = (data?.settings as Record<string, unknown> | null) ?? {};
  const branding = (settings.branding as Record<string, unknown> | undefined) ?? {};

  const initial: BrandingState = {
    logo_url: typeof branding.logo_url === 'string' ? branding.logo_url : null,
    cover_url: typeof branding.cover_url === 'string' ? branding.cover_url : null,
    brand_color:
      typeof branding.brand_color === 'string' && HEX_RE.test(branding.brand_color)
        ? branding.brand_color
        : DEFAULT_BRAND_COLOR,
  };

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold tracking-tight text-zinc-900">
          Identitate vizuală
        </h1>
        <p className="text-sm text-zinc-600">
          Logo-ul, imaginea de copertă și culoarea de brand apar pe storefront-ul
          public ({tenant.name}). Pilotul nu se lansează fără acestea.
        </p>
      </header>

      {role !== 'OWNER' && (
        <div className="rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          Doar utilizatorii cu rolul <strong>OWNER</strong> pot modifica
          identitatea vizuală.
        </div>
      )}

      <BrandingClient
        initial={initial}
        canEdit={role === 'OWNER'}
        tenantId={tenant.id}
      />
    </div>
  );
}
