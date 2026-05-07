import Link from 'next/link';
import { Palette, ChevronRight } from 'lucide-react';
import { createAdminClient } from '@/lib/supabase/admin';
import { getActiveTenant, getTenantRole } from '@/lib/tenant';
import { BrandingClient } from './branding-client';
import { DEFAULT_BRAND_COLOR, type BrandingState } from './types';

const TEMPLATE_LABEL: Record<string, string> = {
  italian: 'Italian',
  asian: 'Asian',
  'fine-dining': 'Fine Dining',
  bistro: 'Bistro',
  'romanian-traditional': 'Tradițional românesc',
  'modern-minimal': 'Modern Minimal',
  'warm-bistro': 'Bistro Cald',
  'bold-urban': 'Urban Bold',
};

export const dynamic = 'force-dynamic';

const HEX_RE = /^#[0-9a-fA-F]{6}$/;

export default async function BrandingSettingsPage() {
  const { user, tenant } = await getActiveTenant();
  const role = await getTenantRole(user.id, tenant.id);

  const admin = createAdminClient();
  // Lane THEMES (2026-05-06): also fetch template_slug for the cross-link
  // banner. Cast through unknown — column not yet in @hir/supabase-types.
  const { data } = await (admin
    .from('tenants') as unknown as {
    select: (s: string) => {
      eq: (col: string, v: string) => {
        maybeSingle: () => Promise<{
          data: { settings: Record<string, unknown> | null; template_slug: string | null } | null;
        }>;
      };
    };
  })
    .select('settings, template_slug')
    .eq('id', tenant.id)
    .maybeSingle();
  const settings = (data?.settings as Record<string, unknown> | null) ?? {};
  const branding = (settings.branding as Record<string, unknown> | undefined) ?? {};
  const templateSlug = data?.template_slug ?? null;
  const templateLabel = templateSlug ? TEMPLATE_LABEL[templateSlug] ?? null : null;

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

      <Link
        href="/dashboard/settings/storefront/theme"
        className="group flex items-center gap-3 rounded-xl border border-zinc-200 bg-white p-4 shadow-sm transition-colors hover:border-purple-300 hover:bg-zinc-50"
      >
        <span className="flex h-9 w-9 flex-none items-center justify-center rounded-md bg-purple-50 text-purple-700 ring-1 ring-inset ring-purple-100">
          <Palette className="h-4 w-4" aria-hidden />
        </span>
        <span className="flex flex-1 flex-col">
          <span className="text-sm font-semibold text-zinc-900 group-hover:text-purple-700">
            Temă vizuală
            {templateLabel ? (
              <span className="ml-2 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-800 ring-1 ring-inset ring-emerald-200">
                {templateLabel}
              </span>
            ) : (
              <span className="ml-2 rounded-full bg-zinc-100 px-2 py-0.5 text-[11px] font-medium text-zinc-700 ring-1 ring-inset ring-zinc-200">
                Implicit
              </span>
            )}
          </span>
          <span className="text-xs text-zinc-600">
            8 teme disponibile — wizard cu previzualizare live.
          </span>
        </span>
        <ChevronRight className="h-4 w-4 flex-none text-zinc-400 group-hover:text-purple-600" aria-hidden />
      </Link>
    </div>
  );
}
