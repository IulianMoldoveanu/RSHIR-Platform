// Lane Y5-EMBED-PAGE (2026-05-07) — dedicated embed settings page.
// Expands the quick-copy card that lives in /dashboard/settings/integrations
// into a full-page experience: mode selector (popup/inline/redirect),
// live snippet preview that reacts to label + color customization,
// and a reseller CNAME proxy section.
//
// Server component: fetches brand color + tenant slug so the snippet is
// pre-filled. All interactive bits are in EmbedPageClient.

import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { createAdminClient } from '@/lib/supabase/admin';
import { getActiveTenant, getTenantRole } from '@/lib/tenant';
import { EmbedPageClient } from './embed-page-client';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Widget site extern — HIR Admin',
};

export default async function EmbedSettingsPage() {
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
  const brandColor =
    typeof branding.brand_color === 'string' &&
    /^#[0-9a-fA-F]{6}$/.test(branding.brand_color)
      ? branding.brand_color
      : '#FF6B35';

  const scriptOrigin = (
    process.env.NEXT_PUBLIC_RESTAURANT_WEB_URL ?? 'https://hiraisolutions.ro'
  ).replace(/\/$/, '');

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-3">
        <Link
          href="/dashboard/settings/integrations#embed"
          className="inline-flex items-center gap-1.5 text-sm text-zinc-500 hover:text-zinc-800"
          aria-label="Înapoi la Integrări"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden />
          Integrări
        </Link>
      </div>

      <header className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold tracking-tight text-zinc-900">
          Widget site extern
        </h1>
        <p className="text-sm text-zinc-600">
          Adăugați butonul de comenzi HIR pe orice site cu o singură linie de
          cod. Funcționează pe WordPress, Wix, Webflow sau HTML simplu.
        </p>
      </header>

      {role !== 'OWNER' && (
        <div className="rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          Doar utilizatorii cu rolul <strong>OWNER</strong> pot vizualiza
          codul de integrare.
        </div>
      )}

      <EmbedPageClient
        tenantSlug={tenant.slug}
        scriptOrigin={scriptOrigin}
        defaultColor={brandColor}
      />
    </div>
  );
}
