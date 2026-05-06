// Theme picker wizard — OWNER-only, zero schema migration.
// Route: /dashboard/settings/storefront/theme
// Cross-linked from /dashboard/settings (settings landing card) and
// /dashboard/settings/branding (existing quick-link).
//
// The 5 existing vertical templates (italian/asian/fine-dining/bistro/
// romanian-traditional) are joined by 3 new style themes (modern-minimal /
// warm-bistro / bold-urban). All 8 ship in @hir/restaurant-templates.

import Link from 'next/link';
import { ChevronLeft } from 'lucide-react';
import { ALL_TEMPLATES } from '@hir/restaurant-templates';
import { createAdminClient } from '@/lib/supabase/admin';
import { getActiveTenant, getTenantRole } from '@/lib/tenant';
import { ThemeWizardClient } from './theme-wizard-client';

export const dynamic = 'force-dynamic';

export default async function ThemePickerWizardPage() {
  const { user, tenant } = await getActiveTenant();
  const role = await getTenantRole(user.id, tenant.id);

  const admin = createAdminClient();
  const { data } = await (admin
    .from('tenants') as unknown as {
    select: (s: string) => {
      eq: (col: string, v: string) => {
        maybeSingle: () => Promise<{
          data: { template_slug: string | null; slug: string } | null;
        }>;
      };
    };
  })
    .select('template_slug, slug')
    .eq('id', tenant.id)
    .maybeSingle();

  const initialSlug = data?.template_slug ?? null;
  const tenantSlug = data?.slug ?? tenant.slug ?? '';

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <Link
          href="/dashboard/settings/branding"
          className="inline-flex items-center gap-1 text-xs font-medium text-zinc-600 hover:text-zinc-900"
        >
          <ChevronLeft className="h-3.5 w-3.5" aria-hidden /> Înapoi la Identitate vizuală
        </Link>
        <h1 className="text-xl font-semibold tracking-tight text-zinc-900">
          Temă vizuală — Wizard
        </h1>
        <p className="text-sm text-zinc-600">
          Alegeți o temă, previzualizați-o pe storefront-ul dvs. și aplicați cu un click.
          Modificarea este imediată; puteți reveni oricând la stilul implicit HIR.
        </p>
      </div>

      {role !== 'OWNER' && (
        <div className="rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          Doar utilizatorii cu rolul <strong>OWNER</strong> pot schimba tema vizuală.
        </div>
      )}

      <ThemeWizardClient
        tenantId={tenant.id}
        tenantSlug={tenantSlug}
        initialSlug={initialSlug}
        templates={ALL_TEMPLATES}
        canEdit={role === 'OWNER'}
      />
    </div>
  );
}
