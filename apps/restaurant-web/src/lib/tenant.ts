import { headers } from 'next/headers';
import type { Json } from '@hir/supabase-types';
import { getTemplate, type RestaurantTemplate } from '@hir/restaurant-templates';
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
  // Lane I (2026-05-04) social-commerce settings. All optional; safely
  // ignored when missing. JSONB payload — no schema migration required.
  /** Free-text tagline shown in OG cards / hero. ≤80 chars in UI. */
  tagline?: string | null;
  /** 1-2 line "about us" string for OG description fallback. ≤200 chars. */
  about_short?: string | null;
  /** Facebook Pixel ID (e.g. "1234567890123456"). Sanitised at render. */
  fb_pixel_id?: string | null;
  /** GA4 Measurement ID (e.g. "G-XXXXXXXX"). Sanitised at render. */
  ga4_measurement_id?: string | null;
  // Lane PRESENTATION (2026-05-06) — optional brand-presentation landing
  // (`/poveste`). All fields live in JSONB so no schema migration is
  // required. Tenants with `presentation_enabled=false` (default) get a
  // 404 on the route so we never expose half-empty pages.
  presentation_enabled?: boolean;
  presentation_about_long?: string | null;
  presentation_gallery?: PresentationGalleryItem[];
  presentation_team?: PresentationTeamMember[];
  presentation_video_url?: string | null;
  presentation_socials?: PresentationSocials | null;
  // Theme picker wizard preview (2026-05-07): OWNER sets this temporarily
  // while previewing a theme in the wizard iframe. Storefront reads it when
  // the `hir-theme-preview` cookie is present and the value matches the
  // tenant ID. Never shown to real end-users unless they somehow have the
  // cookie, which requires an admin session.
  theme_preview_slug?: string | null;
};

export type PresentationGalleryItem = {
  url: string;
  alt?: string | null;
  caption?: string | null;
};

export type PresentationTeamMember = {
  name: string;
  role?: string | null;
  photo_url?: string | null;
};

export type PresentationSocials = {
  instagram?: string | null;
  facebook?: string | null;
  tiktok?: string | null;
  youtube?: string | null;
};

export type PresentationConfig = {
  enabled: boolean;
  aboutLong: string | null;
  gallery: PresentationGalleryItem[];
  team: PresentationTeamMember[];
  videoUrl: string | null;
  socials: PresentationSocials;
};

const SAFE_URL_RE = /^https?:\/\/[^\s<>"']+$/i;
const MAX_GALLERY_ITEMS = 24;
const MAX_TEAM_MEMBERS = 12;

function safeString(v: unknown, max = 2000): string | null {
  if (typeof v !== 'string') return null;
  const trimmed = v.trim();
  if (!trimmed) return null;
  return trimmed.length > max ? trimmed.slice(0, max) : trimmed;
}

function safeUrl(v: unknown): string | null {
  const s = safeString(v, 2000);
  if (!s) return null;
  return SAFE_URL_RE.test(s) ? s : null;
}

/**
 * Defensive helper: read presentation fields out of `settings` JSONB and
 * coerce them into a strict shape. Anything malformed is dropped silently
 * so a corrupted JSONB write can never crash the page. Caller checks
 * `enabled` before rendering — when false, the route should 404.
 */
export function getPresentationConfig(settings: TenantSettings): PresentationConfig {
  const enabled = settings.presentation_enabled === true;
  const aboutLong = safeString(settings.presentation_about_long, 8000);

  const rawGallery = Array.isArray(settings.presentation_gallery)
    ? settings.presentation_gallery
    : [];
  const gallery: PresentationGalleryItem[] = [];
  for (const raw of rawGallery) {
    if (gallery.length >= MAX_GALLERY_ITEMS) break;
    if (!raw || typeof raw !== 'object') continue;
    const item = raw as Record<string, unknown>;
    const url = safeUrl(item.url);
    if (!url) continue;
    gallery.push({
      url,
      alt: safeString(item.alt, 200),
      caption: safeString(item.caption, 200),
    });
  }

  const rawTeam = Array.isArray(settings.presentation_team) ? settings.presentation_team : [];
  const team: PresentationTeamMember[] = [];
  for (const raw of rawTeam) {
    if (team.length >= MAX_TEAM_MEMBERS) break;
    if (!raw || typeof raw !== 'object') continue;
    const item = raw as Record<string, unknown>;
    const name = safeString(item.name, 120);
    if (!name) continue;
    team.push({
      name,
      role: safeString(item.role, 120),
      photo_url: safeUrl(item.photo_url),
    });
  }

  const videoUrl = safeUrl(settings.presentation_video_url);

  const rawSocials = (settings.presentation_socials ?? null) as PresentationSocials | null;
  const socials: PresentationSocials = {
    instagram: safeUrl(rawSocials?.instagram),
    facebook: safeUrl(rawSocials?.facebook),
    tiktok: safeUrl(rawSocials?.tiktok),
    youtube: safeUrl(rawSocials?.youtube),
  };

  return { enabled, aboutLong, gallery, team, videoUrl, socials };
}

export const DEFAULT_BRAND_COLOR = '#7c3aed';
export const DEFAULT_ACCENT_COLOR = '#f5f3ff';
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

/**
 * Lane THEMES (2026-05-06): resolve the active vertical template for a tenant
 * and merge its values with the tenant's own branding overrides. Tenants
 * with `template_slug = NULL` keep the historical default look (purple
 * #7c3aed brand + Inter sans for both heading and body); tenants with a
 * template get accent + heading-font + body-font tokens from the package.
 *
 * Precedence (high → low):
 *   1. tenant.settings.branding.brand_color (OWNER override in admin)
 *   2. template.branding.brand_color (when template_slug is set)
 *   3. DEFAULT_BRAND_COLOR
 *
 * Fonts come straight from the template (or default to `inter` for both)
 * — there's no per-tenant font override surface yet.
 */
export type ResolvedTheme = {
  brandColor: string;
  accentColor: string;
  headingFont: 'inter' | 'playfair' | 'space-grotesk' | 'fraunces' | 'oswald';
  bodyFont: 'inter' | 'space-grotesk';
  templateSlug: string | null;
};

export function themeFor(
  settings: TenantSettings,
  templateSlug: string | null,
): ResolvedTheme {
  const template: RestaurantTemplate | null = templateSlug ? getTemplate(templateSlug) : null;
  const { brandColor } = brandingFor(settings);
  const ownerOverrode =
    typeof settings.branding?.brand_color === 'string' &&
    HEX_RE.test(settings.branding.brand_color);

  return {
    brandColor: ownerOverrode || !template ? brandColor : template.branding.brand_color,
    accentColor: template?.branding.accent_color ?? DEFAULT_ACCENT_COLOR,
    headingFont: template?.typography.heading_font ?? 'inter',
    bodyFont: template?.typography.body_font ?? 'inter',
    templateSlug: template?.slug ?? null,
  };
}

export type ResolvedTenant = {
  id: string;
  slug: string;
  name: string;
  custom_domain: string | null;
  status: string;
  settings: TenantSettings;
  template_slug: string | null;
};

type TenantRow = {
  id: string;
  slug: string;
  name: string;
  custom_domain: string | null;
  status: string;
  settings: Json;
  template_slug: string | null;
};

// Primary public domain is env-driven so the codebase isn't tied to any one
// brand registration. Set NEXT_PUBLIC_PRIMARY_DOMAIN (e.g. "myrestaurants.com")
// in Vercel to match the apex you actually own. `lvh.me` is kept as a dev
// fallback (resolves any subdomain to 127.0.0.1) so local dev still works
// without configuration.
const PRIMARY_DOMAIN = process.env.NEXT_PUBLIC_PRIMARY_DOMAIN || '';
const SUBDOMAIN_BASES: string[] = ['lvh.me', ...(PRIMARY_DOMAIN ? [PRIMARY_DOMAIN] : [])];

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
 *   1. If host is `<slug>.lvh.me` or `<slug>.<NEXT_PUBLIC_PRIMARY_DOMAIN>`
 *      → resolve by slug.
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
  const SELECT = 'id, slug, name, custom_domain, status, settings, template_slug';

  let row: TenantRow | null = null;
  // Preview-host tenant override (?tenant=<slug>). Only honored on
  // Vercel auto-generated URLs and local dev — production canonical
  // hosts ignore the override so end-users can't tenant-switch by URL.
  const overrideSlug = isPreviewHost(host)
    ? h.get('x-hir-tenant-override')?.toLowerCase() ?? null
    : null;

  // Storefront resolver reads through `v_tenants_storefront` — the
  // anon-safe projection that strips fiscal/legal subkeys and excludes
  // external_dispatch_secret. Internal callers use the underlying
  // tenants table via service-role admin client.
  if (overrideSlug) {
    row = (await supabase.from('v_tenants_storefront').select(SELECT).eq('slug', overrideSlug).maybeSingle())
      .data as TenantRow | null;
  } else if (subSlug) {
    row = (await supabase.from('v_tenants_storefront').select(SELECT).eq('slug', subSlug).maybeSingle())
      .data as TenantRow | null;
  } else if (host) {
    row = (
      await supabase
        .from('v_tenants_storefront')
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
      template_slug: row.template_slug ?? null,
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
