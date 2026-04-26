import { headers } from 'next/headers';
import type { Json } from '@hir/supabase-types';
import { getSupabase } from './supabase';

export type TenantBranding = {
  logo_url?: string | null;
  cover_url?: string | null;
  brand_color?: string | null;
};

export type TenantSettings = {
  logo_url?: string | null;
  cover_url?: string | null;
  whatsapp_phone?: string | null;
  bio_item_ids?: string[];
  branding?: TenantBranding;
  // Commerce thresholds (set in admin Operations & program). 0 / undefined
  // means "not configured" — UI hides the corresponding nudge.
  min_order_ron?: number;
  free_delivery_threshold_ron?: number;
  delivery_eta_min_minutes?: number;
  delivery_eta_max_minutes?: number;
  // Cash-on-delivery toggle. When true, checkout shows a Card / Cash radio
  // and Cash skips the Stripe payment intent entirely. Default false to
  // keep existing tenants on the card-only flow.
  cod_enabled?: boolean;
};

export const DEFAULT_BRAND_COLOR = '#7c3aed';
const HEX_RE = /^#[0-9a-fA-F]{6}$/;

/**
 * RSHIR-28: read branding sub-object with sane fallbacks. Falls back to the
 * legacy top-level `logo_url`/`cover_url` keys so tenants who set those
 * before the branding bucket existed don't lose imagery.
 */
export function brandingFor(settings: TenantSettings): {
  logoUrl: string | null;
  coverUrl: string | null;
  brandColor: string;
} {
  const b = settings.branding ?? {};
  return {
    logoUrl: b.logo_url ?? settings.logo_url ?? null,
    coverUrl: b.cover_url ?? settings.cover_url ?? null,
    brandColor:
      typeof b.brand_color === 'string' && HEX_RE.test(b.brand_color)
        ? b.brand_color
        : DEFAULT_BRAND_COLOR,
  };
}

export type ResolvedTenant = {
  id: string;
  slug: string;
  name: string;
  custom_domain: string | null;
  status: string;
  settings: TenantSettings;
};

type TenantRow = {
  id: string;
  slug: string;
  name: string;
  custom_domain: string | null;
  status: string;
  settings: Json;
};

const SUBDOMAIN_BASES = ['lvh.me', 'hir.ro', 'rshir.ro'] as const;

function subdomainSlug(host: string): string | null {
  for (const base of SUBDOMAIN_BASES) {
    const suffix = `.${base}`;
    if (host.endsWith(suffix)) {
      const label = host.slice(0, -suffix.length);
      if (label && !label.includes('.')) return label;
    }
  }
  return null;
}

/**
 * True for Vercel auto-generated preview / production URLs (e.g.
 * hir-restaurant-abc123-iulianmoldoveanus-projects.vercel.app). On those
 * hosts the host-derived slug never matches a real tenant, so we accept a
 * `?tenant=<slug>` or `x-hir-tenant-slug` header override for staging/QA.
 * The override is hard-disabled on canonical (production custom-domain)
 * hosts so end-users can't tenant-switch by URL param.
 */
function isPreviewHost(host: string): boolean {
  return host.endsWith('.vercel.app') || host === 'localhost' || host.endsWith('.lvh.me');
}

/**
 * Resolves the active tenant for the current request from the host header.
 * Lookup order:
 *   1. If host is `<slug>.lvh.me` or `<slug>.hir.ro` → resolve by slug.
 *   2. Otherwise treat host as a custom domain (status must be ACTIVE).
 * Returns null if neither matches.
 */
export async function resolveTenantFromHost(): Promise<{
  tenant: ResolvedTenant | null;
  host: string;
  slug: string;
}> {
  const h = headers();
  const rawHost = h.get('x-hir-host') ?? h.get('host')?.split(':')[0] ?? '';
  const host = rawHost.toLowerCase();
  const subSlug = subdomainSlug(host);
  const slug = subSlug ?? h.get('x-hir-tenant-slug')?.toLowerCase() ?? host.split('.')[0];

  const supabase = getSupabase();
  const SELECT = 'id, slug, name, custom_domain, status, settings';

  let row: TenantRow | null = null;
  // Preview-host tenant override (?tenant=<slug>). Only honored on
  // Vercel auto-generated URLs and local dev — production canonical
  // hosts ignore the override so end-users can't tenant-switch by URL.
  const overrideSlug = isPreviewHost(host)
    ? h.get('x-hir-tenant-override')?.toLowerCase() ?? null
    : null;

  if (overrideSlug) {
    row = (await supabase.from('tenants').select(SELECT).eq('slug', overrideSlug).maybeSingle())
      .data as TenantRow | null;
  } else if (subSlug) {
    row = (await supabase.from('tenants').select(SELECT).eq('slug', subSlug).maybeSingle())
      .data as TenantRow | null;
  } else if (host) {
    row = (
      await supabase
        .from('tenants')
        .select(SELECT)
        .eq('custom_domain', host)
        .eq('domain_status', 'ACTIVE')
        .maybeSingle()
    ).data as TenantRow | null;
  }

  if (!row) return { tenant: null, host, slug };

  const settings = (row.settings ?? {}) as TenantSettings;
  return {
    tenant: {
      id: row.id,
      slug: row.slug,
      name: row.name,
      custom_domain: row.custom_domain,
      status: row.status,
      settings,
    },
    host,
    slug,
  };
}

export function tenantBaseUrl(): string {
  const h = headers();
  const hostWithPort =
    h.get('x-hir-host-with-port') ?? h.get('host') ?? h.get('x-hir-host') ?? '';
  const hostNoPort = hostWithPort.split(':')[0];
  const proto =
    hostNoPort === 'localhost' || hostNoPort.endsWith('.lvh.me') ? 'http' : 'https';
  return `${proto}://${hostWithPort}`;
}
