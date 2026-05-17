// Lane ONBOARD: 6-step self-service onboarding wizard.
//
// Designed for the in-meeting demo: Iulian (or the patron themselves on a
// phone) walks through these six panels and the tenant goes from "just
// created" to "live and accepting orders" in <10 min. Mobile-first: 360px
// works, the progress bar stays sticky on small screens.
//
// This page is the single source of truth for "where am I in onboarding".
// Heavy sub-flows (zones map, master-key import, branding upload) link out
// to their existing pages and the wizard auto-resumes on return because
// each step queries the underlying source-of-truth tables (menu items,
// zones, branding) on every render.

import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createAdminClient } from '@/lib/supabase/admin';
import { computeOnboardingState } from '@/lib/onboarding';
import { getActiveTenant, getTenantRole } from '@/lib/tenant';
import { listActiveCities } from '@/lib/cities';
import { WizardClient } from './client';
import { loadWizardDraft, type WizardDraft } from './actions';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const DEFAULT_DRAFT: WizardDraft = {
  restaurantInfo: {
    phone: '',
    address: '',
    city: '',
    city_id: null,
    location_lat: null,
    location_lng: null,
  },
  brand: { skipped: false },
  menu: { source: null },
  delivery: { tier: null },
  payment: { cod_enabled: true },
  integration: { mode: null, rawKey: null },
};

export default async function OnboardingWizardPage() {
  const { user, tenant } = await getActiveTenant();
  const role = await getTenantRole(user.id, tenant.id);
  if (role !== 'OWNER') {
    return (
      <div className="rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
        Doar utilizatorii cu rolul <strong>OWNER</strong> pot rula asistentul de onboarding.
      </div>
    );
  }

  // Source-of-truth state (menu / hours / zones / went-live), independent
  // of the per-user draft. The wizard uses this to auto-tick steps.
  const state = await computeOnboardingState(tenant.id);

  // Per-user draft (form fields the user has typed but not finalized).
  const draftRes = await loadWizardDraft(tenant.id);
  const rawDraft: WizardDraft =
    draftRes.ok && draftRes.draft ? draftRes.draft : DEFAULT_DRAFT;
  // Lane MULTI-CITY: existing drafts (saved before this lane) won't have
  // `city_id` — backfill it to null so the client never reads undefined.
  const initialDraft: WizardDraft = {
    ...rawDraft,
    restaurantInfo: {
      ...rawDraft.restaurantInfo,
      city_id: rawDraft.restaurantInfo.city_id ?? null,
    },
  };
  const initialStep = draftRes.ok ? draftRes.step : 1;

  // Read persisted contact + branding so Step 1 + Step 2 reflect what's
  // already on the tenant (relevant if they came back from a sub-page).
  const admin = createAdminClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: tenantRow } = await (admin as any)
    .from('tenants')
    .select('settings, city_id')
    .eq('id', tenant.id)
    .maybeSingle();
  const settings = (tenantRow?.settings as Record<string, unknown> | null) ?? {};
  const persistedCityId =
    typeof tenantRow?.city_id === 'string' ? (tenantRow.city_id as string) : null;
  const branding = (settings.branding as Record<string, unknown> | undefined) ?? {};
  const flatBrand = (settings.brand as Record<string, unknown> | undefined) ?? {};
  const persisted = {
    contact_phone:
      typeof settings.contact_phone === 'string' ? (settings.contact_phone as string) : '',
    address: typeof settings.address === 'string' ? (settings.address as string) : '',
    city: typeof settings.city === 'string' ? (settings.city as string) : '',
    city_id: persistedCityId,
    location_lat:
      settings.location && typeof (settings.location as { lat?: unknown }).lat === 'number'
        ? ((settings.location as { lat: number }).lat as number)
        : null,
    location_lng:
      settings.location && typeof (settings.location as { lng?: unknown }).lng === 'number'
        ? ((settings.location as { lng: number }).lng as number)
        : null,
    logo_url:
      typeof branding.logo_url === 'string'
        ? (branding.logo_url as string)
        : typeof settings.logo_url === 'string'
          ? (settings.logo_url as string)
          : null,
    brand_color:
      typeof branding.brand_color === 'string'
        ? (branding.brand_color as string)
        : typeof flatBrand.primary_color === 'string'
          ? (flatBrand.primary_color as string)
          : null,
    cod_enabled: settings.cod_enabled !== false, // default true
  };

  // Lane MULTI-CITY: load canonical cities for the Step 1 dropdown.
  const cities = await listActiveCities();

  // If the tenant is already live, redirect to dashboard — wizard is done.
  if (state.went_live) {
    redirect('/dashboard');
  }

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-2">
        <div className="text-xs font-medium uppercase tracking-wide text-zinc-500">
          Asistent de configurare
        </div>
        <h1 className="text-xl font-semibold tracking-tight text-zinc-900 sm:text-2xl">
          {tenant.name} · 7 pași până la prima comandă
        </h1>
        <p className="text-sm text-zinc-600">
          Răspunzi la fiecare pas, salvăm automat. Poți închide tabul oricând —
          revii și continui de unde ai rămas.
        </p>
      </header>

      <WizardClient
        tenantId={tenant.id}
        tenantSlug={tenant.slug}
        tenantName={tenant.name}
        canEdit={true}
        initialDraft={initialDraft}
        initialStep={initialStep}
        sourceState={{
          menu_added: state.menu_added,
          hours_set: state.hours_set,
          zones_set: state.zones_set,
        }}
        persisted={persisted}
        cities={cities}
      />

      <div className="text-xs text-zinc-500">
        Vrei să sari peste asistent? Mergi la{' '}
        <Link href="/dashboard/onboarding" className="underline">
          checklist-ul clasic
        </Link>
        .
      </div>
    </div>
  );
}
