import { getActiveTenant, getTenantRole } from '@/lib/tenant';
import { listMenuBrands } from './actions';
import { MenuBrandsClient } from './menu-brands-client';

export const dynamic = 'force-dynamic';

// Only relevant for tenants using the multi-brand-menu feature (one
// kitchen, several customer-facing brands — e.g. Delivery House: Chicken
// Press, Brunch House, Egg & Smash House). The storefront already renders
// brand.logo_url on the brand-selector tabs (brand-aware-menu.tsx) whenever
// it's set — this page is the missing piece: somewhere to actually upload it.
export default async function MenuBrandsSettingsPage() {
  const { user, tenant } = await getActiveTenant();
  const role = await getTenantRole(user.id, tenant.id);
  const brands = await listMenuBrands(tenant.id);

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold tracking-tight text-zinc-900">
          Branduri meniu
        </h1>
        <p className="text-sm text-zinc-600">
          Dacă restaurantul tău servește mai multe branduri dintr-o singură bucătărie,
          sigla fiecăruia apare pe butoanele de selecție brand din storefront.
        </p>
      </header>

      {role !== 'OWNER' && (
        <div className="rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          Doar utilizatorii cu rolul <strong>OWNER</strong> pot modifica siglele brandurilor.
        </div>
      )}

      {brands.length === 0 ? (
        <div className="rounded-xl border border-dashed border-zinc-300 bg-zinc-50 p-6 text-center">
          <p className="text-sm font-medium text-zinc-700">
            Restaurantul tău nu are branduri de meniu configurate.
          </p>
          <p className="mt-1 text-xs text-zinc-500">
            Această pagină e relevantă doar pentru bucătării care servesc mai multe branduri
            (ex. Delivery House). Dacă vrei să activezi funcția, contactează suportul.
          </p>
        </div>
      ) : (
        <MenuBrandsClient brands={brands} canEdit={role === 'OWNER'} tenantId={tenant.id} />
      )}
    </div>
  );
}
