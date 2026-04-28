import { getActiveTenant, getTenantRole } from '@/lib/tenant';
import { getCurrentTenantDomain, type DomainStatus } from '@/app/api/domains/shared';
import { readVercelConfig } from '@/lib/vercel';
import { DomainSettings } from './domain-settings';

export const dynamic = 'force-dynamic';

export default async function DomainSettingsPage() {
  const { user, tenant } = await getActiveTenant();
  const role = await getTenantRole(user.id, tenant.id);
  const current = await getCurrentTenantDomain(tenant.id);
  const vercelReady = readVercelConfig().kind === 'configured';
  const primaryDomain = process.env.NEXT_PUBLIC_PRIMARY_DOMAIN || 'lvh.me';

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold tracking-tight text-zinc-900">
          Domeniu personalizat
        </h1>
        <p className="text-sm text-zinc-600">
          Atașează propriul domeniu (ex. <code className="rounded bg-zinc-100 px-1">menu.restaurantul-tau.ro</code>)
          în locul subdomeniului <code className="rounded bg-zinc-100 px-1">{tenant.slug}.{primaryDomain}</code>.
        </p>
      </header>

      {!vercelReady && (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Integrarea Vercel nu este configurată în acest mediu (lipsește
          <code className="mx-1 rounded bg-amber-100 px-1">VERCEL_TOKEN</code>
          sau <code className="mx-1 rounded bg-amber-100 px-1">VERCEL_PROJECT_ID</code>).
          Poți salva domeniul în baza de date, dar nu va fi atașat la Vercel până
          când planul Pro nu este activ.
        </div>
      )}

      {role !== 'OWNER' && (
        <div className="rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          Doar utilizatorii cu rolul <strong>OWNER</strong> pot modifica domeniul.
        </div>
      )}

      <DomainSettings
        canEdit={role === 'OWNER'}
        domain={current.domain}
        status={current.status as DomainStatus}
        verifiedAt={current.verifiedAt}
      />
    </div>
  );
}
