// Shared validators + types for partner white-label `landing_settings` jsonb.
//
// Used by both:
//   - admin path: apps/restaurant-admin/src/app/dashboard/admin/partners/actions.ts
//     (PLATFORM_ADMIN edits any partner's branding)
//   - partner self-serve path: apps/restaurant-admin/src/app/partner-portal/actions.ts
//     (partner edits ONLY their own row)
//
// The jsonb is additive — old fields stay valid, new ones are merged in via
// the `partner_landing_merge` RPC (or read-modify-write fallback). No schema
// migration needed.
//
// Field inventory (as of 2026-05-08):
//   headline           — H1 on /r/<code>. <=200 chars.
//   blurb              — sub-copy under H1. <=1000 chars.
//   cta_url            — primary CTA link. https:// or relative '/'. <=500 chars.
//   accent_color       — #RGB or #RRGGBB.
//   hero_image_url     — hero photo. https:// + host-allowlisted. <=500 chars.
//
// New in PR feat/reseller-white-label-per-partner-2026-05-08 (Option A):
//   logo_url           — header logo. Same allow-list as hero_image_url.
//   tagline_ro         — RO sub-tagline. <=140 chars.
//   tagline_en         — EN sub-tagline. <=140 chars.
//   tenant_count_floor — integer >=0; "active" tenant count display floor
//                        for partner-tier free-tier visualization. Optional.
//
// Security notes
// --------------
// - cta_url: blocks javascript:, data:, file:, ftp: schemes that could
//   redirect visitors to phishing or trigger XSS via inline navigation.
// - hero_image_url + logo_url: must be https:// AND host-allowlisted (Vercel
//   blob, Supabase storage, Cloudinary, Imgur, our own domains). Prevents
//   resellers hosting CSAM / tracking pixels / mixed content on /r/<code>.
// - accent_color: React's style prop sanitizes raw CSS but we double-validate
//   to keep audit logs clean and prevent UI-layer surprises.
// - tagline_ro / tagline_en: length-capped only. Rendered as text content,
//   not HTML, so XSS surface is bounded by React escaping.
// - tenant_count_floor: integer-only, non-negative, capped at 100_000 to
//   prevent abuse of the display floor (no commission impact — vanity field).

export const PARTNER_LANDING_HOST_ALLOWLIST = [
  'public.blob.vercel-storage.com',
  'images.unsplash.com',
  'res.cloudinary.com',
  'i.imgur.com',
  'qfmeojeipncuxeltnvab.supabase.co',
  'hirforyou.ro',
] as const;

export const HEADLINE_MAX = 200;
export const BLURB_MAX = 1000;
export const TAGLINE_MAX = 140;
export const URL_MAX = 500;
export const TENANT_COUNT_FLOOR_MAX = 100_000;

export type LandingPatch = {
  headline?: string;
  blurb?: string;
  cta_url?: string;
  accent_color?: string;
  hero_image_url?: string;
  logo_url?: string;
  tagline_ro?: string;
  tagline_en?: string;
  tenant_count_floor?: number;
};

export type LandingSettings = LandingPatch & Record<string, unknown>;

type Result = { ok: true } | { ok: false; error: string };

export function validateCtaUrl(s: string): Result {
  if (s.length > URL_MAX) return { ok: false, error: `cta_url > ${URL_MAX} chars` };
  if (s.length === 0) return { ok: true };
  if (s.startsWith('/')) return { ok: true };
  let u: URL;
  try {
    u = new URL(s);
  } catch {
    return { ok: false, error: 'cta_url not a valid URL' };
  }
  if (u.protocol !== 'https:') return { ok: false, error: 'cta_url must be https://' };
  return { ok: true };
}

function validateAllowlistedImageUrl(field: 'hero_image_url' | 'logo_url', s: string): Result {
  if (s.length > URL_MAX) return { ok: false, error: `${field} > ${URL_MAX} chars` };
  if (s.length === 0) return { ok: true };
  let u: URL;
  try {
    u = new URL(s);
  } catch {
    return { ok: false, error: `${field} not a valid URL` };
  }
  if (u.protocol !== 'https:') return { ok: false, error: `${field} must be https://` };
  if (!(PARTNER_LANDING_HOST_ALLOWLIST as readonly string[]).includes(u.hostname)) {
    return {
      ok: false,
      error: `${field} host not allow-listed (use one of: ${PARTNER_LANDING_HOST_ALLOWLIST.join(', ')})`,
    };
  }
  return { ok: true };
}

export function validateHeroImageUrl(s: string): Result {
  return validateAllowlistedImageUrl('hero_image_url', s);
}

export function validateLogoUrl(s: string): Result {
  return validateAllowlistedImageUrl('logo_url', s);
}

export function validateAccentColor(s: string): Result {
  if (s.length === 0) return { ok: true };
  if (!/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(s)) {
    return { ok: false, error: 'accent_color must be #RGB or #RRGGBB hex' };
  }
  return { ok: true };
}

export function validateTagline(field: 'tagline_ro' | 'tagline_en', s: string): Result {
  if (s.length > TAGLINE_MAX) {
    return { ok: false, error: `${field} > ${TAGLINE_MAX} chars` };
  }
  return { ok: true };
}

export function validateTenantCountFloor(n: number): Result {
  if (!Number.isFinite(n) || !Number.isInteger(n)) {
    return { ok: false, error: 'tenant_count_floor must be an integer' };
  }
  if (n < 0) return { ok: false, error: 'tenant_count_floor must be >= 0' };
  if (n > TENANT_COUNT_FLOOR_MAX) {
    return { ok: false, error: `tenant_count_floor must be <= ${TENANT_COUNT_FLOOR_MAX}` };
  }
  return { ok: true };
}

// Build the jsonb merge patch from a raw input object. Skips `undefined`
// keys so missing fields keep their existing value via shallow-merge.
// Returns the patch or an error string. The caller decides whether an
// empty patch is an error (e.g. admin returns 'Nimic de actualizat.').
export function buildLandingPatch(input: LandingPatch): Result & { patch?: Record<string, unknown> } {
  const patch: Record<string, unknown> = {};

  if (typeof input.headline === 'string') {
    if (input.headline.length > HEADLINE_MAX) {
      return { ok: false, error: `headline > ${HEADLINE_MAX} chars` };
    }
    patch.headline = input.headline;
  }
  if (typeof input.blurb === 'string') {
    if (input.blurb.length > BLURB_MAX) {
      return { ok: false, error: `blurb > ${BLURB_MAX} chars` };
    }
    patch.blurb = input.blurb;
  }
  if (typeof input.cta_url === 'string') {
    const v = validateCtaUrl(input.cta_url);
    if (!v.ok) return v;
    patch.cta_url = input.cta_url;
  }
  if (typeof input.accent_color === 'string') {
    const v = validateAccentColor(input.accent_color);
    if (!v.ok) return v;
    patch.accent_color = input.accent_color;
  }
  if (typeof input.hero_image_url === 'string') {
    const v = validateHeroImageUrl(input.hero_image_url);
    if (!v.ok) return v;
    patch.hero_image_url = input.hero_image_url;
  }
  if (typeof input.logo_url === 'string') {
    const v = validateLogoUrl(input.logo_url);
    if (!v.ok) return v;
    patch.logo_url = input.logo_url;
  }
  if (typeof input.tagline_ro === 'string') {
    const v = validateTagline('tagline_ro', input.tagline_ro);
    if (!v.ok) return v;
    patch.tagline_ro = input.tagline_ro;
  }
  if (typeof input.tagline_en === 'string') {
    const v = validateTagline('tagline_en', input.tagline_en);
    if (!v.ok) return v;
    patch.tagline_en = input.tagline_en;
  }
  if (typeof input.tenant_count_floor === 'number') {
    const v = validateTenantCountFloor(input.tenant_count_floor);
    if (!v.ok) return v;
    patch.tenant_count_floor = Math.floor(input.tenant_count_floor);
  }

  return { ok: true, patch };
}
