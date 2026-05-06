// Lane PRESENTATION (2026-05-06) — admin page for the optional brand
// presentation page (`/poveste`). OWNER-only writes. No DDL needed; data
// lives in `tenants.settings` JSONB under `presentation_*` keys.

import Link from 'next/link';
import { ChevronLeft } from 'lucide-react';
import { getActiveTenant, getTenantRole } from '@/lib/tenant';
import { getPresentationState } from './actions';
import { PresentationClient } from './presentation-client';

export const dynamic = 'force-dynamic';

// Build a `/poveste` URL that respects the same rules as `tenantStorefrontUrl`
// but appends `/poveste` either as a path on the subdomain host or before the
// `?tenant=` query string when running in the fallback mode.
function tenantPovesteUrl(slug: string): string {
  const subdomainBase = process.env.NEXT_PUBLIC_TENANT_SUBDOMAIN_BASE?.trim();
  if (subdomainBase) {
    return `https://${slug}.${subdomainBase}/poveste`;
  }
  const webBase = (
    process.env.NEXT_PUBLIC_RESTAURANT_WEB_URL ?? 'https://hir-restaurant-web.vercel.app'
  ).replace(/\/+$/, '');
  return `${webBase}/poveste?tenant=${encodeURIComponent(slug)}`;
}

export default async function PresentationSettingsPage() {
  const { user, tenant } = await getActiveTenant();
  const role = await getTenantRole(user.id, tenant.id);
  const initial = await getPresentationState();
  // Final preview URL (already includes `/poveste`). The client appends
  // nothing — it just renders the link verbatim.
  const povesteUrl = tenantPovesteUrl(tenant.slug);

  return (
    <div className="flex flex-col gap-6">
      <Link
        href="/dashboard/settings/branding"
        className="inline-flex items-center gap-1 text-xs text-zinc-500 hover:text-zinc-800"
      >
        <ChevronLeft className="h-3.5 w-3.5" aria-hidden /> Înapoi la Identitate vizuală
      </Link>

      <header className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold tracking-tight text-zinc-900">
          Pagină de prezentare
        </h1>
        <p className="text-sm text-zinc-600">
          O pagină opțională la <code className="rounded bg-zinc-100 px-1 py-0.5 text-[12px]">/poveste</code>{' '}
          unde {tenant.name} poate spune povestea, prezenta echipa și galerie de imagini.
          Independentă de magazin — utilă pentru clienți care vor doar să vă cunoască.
        </p>
      </header>

      {role !== 'OWNER' && (
        <div className="rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          Doar utilizatorii cu rolul <strong>OWNER</strong> pot edita pagina de prezentare.
        </div>
      )}

      <PresentationClient
        initial={initial}
        canEdit={role === 'OWNER'}
        tenantId={tenant.id}
        povesteUrl={povesteUrl}
      />
    </div>
  );
}
