// Public reseller landing page — `/r/<code>`.
// Looks up the partner by code, renders the white-label-configurable
// landing, and queues a visit-tracking insert (fire-and-forget).
//
// Visit tracking is anonymous: we hash IP + monthly salt before storing.
// If the code doesn't exist or partner is not ACTIVE, we 404.

import { notFound } from 'next/navigation';
import { headers } from 'next/headers';
import { createHash } from 'node:crypto';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { pickLocale, pickTagline, safeImageUrl } from './helpers';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type PartnerRow = {
  id: string;
  name: string;
  code: string;
  status: string;
  landing_settings: {
    headline?: string;
    blurb?: string;
    cta_url?: string;
    accent_color?: string;
    hero_image_url?: string;
    // PR feat/reseller-white-label-per-partner-2026-05-08
    logo_url?: string;
    tagline_ro?: string;
    tagline_en?: string;
    tenant_count_floor?: number;
  } | null;
};

const DEFAULT_LANDING = {
  headline: 'HIRforYOU — soluția de comenzi online pentru restaurante',
  blurb:
    'Plătești doar 2 lei / comandă. Fără abonament. White-label, multi-locație, cu AI care optimizează vânzările zilnic.',
  cta_url: '/migrate-from-gloriafood',
  accent_color: '#0f766e',
};

// Pure helpers (allow-list, image URL guard, locale pick, tagline fallback)
// live in ./helpers so they can be unit-tested without booting Next.js.

function hashIp(ip: string): string {
  const month = new Date().toISOString().slice(0, 7); // YYYY-MM
  const salt = process.env.PARTNER_VISITS_SALT ?? 'static-salt-rotate-monthly';
  return createHash('sha256').update(`${ip}|${month}|${salt}`).digest('hex').slice(0, 32);
}

async function trackVisit(partnerId: string): Promise<void> {
  try {
    const h = headers();
    const fwd = h.get('x-forwarded-for') ?? '';
    const ip = fwd.split(',')[0].trim() || h.get('x-real-ip') || '0.0.0.0';
    const ua = h.get('user-agent') ?? '';
    const referer = h.get('referer') ?? '';
    const country = h.get('x-vercel-ip-country') ?? null;

    const admin = getSupabaseAdmin();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (admin as any).from('partner_visits').insert({
      partner_id: partnerId,
      ip_hash: hashIp(ip),
      user_agent: ua.slice(0, 500),
      referer: referer.slice(0, 500) || null,
      country,
    });
  } catch {
    // Visit tracking is fire-and-forget; never block the landing render.
  }
}

export default async function ResellerLandingPage({
  params,
}: {
  params: { code: string };
}) {
  const code = (params.code ?? '').trim().toUpperCase();
  if (!/^[A-Z0-9]{4,32}$/.test(code)) notFound();

  const admin = getSupabaseAdmin();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (admin as any)
    .from('partners')
    .select('id, name, code, status, landing_settings')
    .eq('code', code)
    .maybeSingle();

  if (error || !data) notFound();
  const partner = data as PartnerRow;
  // Lane T: PENDING partners (self-signed-up, awaiting admin approval) can
  // already share their /r/<code> link. Visit tracking + attribution still
  // accrues; commission is gated downstream by partner_referrals + status.
  if (partner.status !== 'ACTIVE' && partner.status !== 'PENDING') notFound();

  // Track the visit. Fire-and-forget — don't await in a way that delays
  // hydration.
  trackVisit(partner.id);

  const merged = { ...DEFAULT_LANDING, ...(partner.landing_settings ?? {}) };

  // Defense-in-depth: never render a cta_url that isn't https:// or relative.
  // updatePartnerLanding already validates on write, but a row inserted via
  // raw SQL could bypass.
  const rawCta = merged.cta_url ?? DEFAULT_LANDING.cta_url;
  let safeCta = DEFAULT_LANDING.cta_url;
  if (typeof rawCta === 'string') {
    if (rawCta.startsWith('/')) {
      safeCta = rawCta;
    } else {
      try {
        const u = new URL(rawCta);
        if (u.protocol === 'https:') safeCta = rawCta;
      } catch { /* keep default */ }
    }
  }
  const ctaHref = safeCta + (safeCta.includes('?') ? '&' : '?') + `ref=${encodeURIComponent(code)}`;

  // Image URLs go through a stricter allow-list check (host + protocol).
  const safeHero = safeImageUrl(merged.hero_image_url);
  const safeLogo = safeImageUrl(merged.logo_url);

  // accent_color: only allow #RGB or #RRGGBB. Default if invalid.
  const rawAccent = merged.accent_color ?? DEFAULT_LANDING.accent_color;
  const safeAccent = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(String(rawAccent ?? ''))
    ? String(rawAccent)
    : DEFAULT_LANDING.accent_color;

  // Locale: pick from Accept-Language; pick the matching tagline if present.
  const acceptLanguage = headers().get('accept-language');
  const locale = pickLocale(acceptLanguage);
  const safeTagline = pickTagline(locale, merged.tagline_ro, merged.tagline_en);

  // tenant_count_floor: integer 0..100_000. Used as social-proof line when set.
  const rawFloor = merged.tenant_count_floor;
  const safeFloor =
    typeof rawFloor === 'number' && Number.isFinite(rawFloor) && rawFloor >= 0 && rawFloor <= 100_000
      ? Math.floor(rawFloor)
      : null;

  // Locale-aware copy strings (only the surface chrome — partner-supplied
  // headline / blurb / tagline already carry their own language).
  const t = locale === 'en'
    ? {
        recommended_by: 'Recommended by',
        cta: 'Get started with HIR',
        ref_code: 'Referral code:',
        powered_by: 'Powered by HIR',
        floor_suffix: 'restaurants already on HIR',
      }
    : {
        recommended_by: 'Recomandat de',
        cta: 'Începe acum cu HIR',
        ref_code: 'Cod referal:',
        powered_by: 'Powered by HIR',
        floor_suffix: 'restaurante folosesc deja HIR',
      };

  return (
    <main
      lang={locale}
      style={{
        minHeight: '100vh',
        background: `linear-gradient(135deg, ${safeAccent}10 0%, #ffffff 60%)`,
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
        color: '#1e293b',
      }}
    >
      {/* Header band: optional partner logo on the left, "recommended by" on the right. */}
      <header
        style={{
          maxWidth: 920,
          margin: '0 auto',
          padding: '24px 24px 0',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 16,
        }}
      >
        {safeLogo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={safeLogo}
            alt={partner.name}
            style={{ height: 40, width: 'auto', objectFit: 'contain' }}
          />
        ) : (
          <div
            aria-hidden
            style={{
              height: 40,
              display: 'flex',
              alignItems: 'center',
              fontWeight: 700,
              fontSize: 18,
              color: '#0f172a',
            }}
          >
            {partner.name}
          </div>
        )}
        <div style={{ fontSize: 13, color: '#64748b' }}>
          {t.recommended_by} <strong style={{ color: '#0f172a' }}>{partner.name}</strong>
        </div>
      </header>

      <section style={{ maxWidth: 920, margin: '0 auto', padding: '40px 24px 64px' }}>
        <h1
          style={{
            fontSize: 'clamp(28px, 5vw, 48px)',
            lineHeight: 1.15,
            margin: '0 0 12px',
            fontWeight: 700,
            color: '#0f172a',
          }}
        >
          {merged.headline}
        </h1>

        {safeTagline ? (
          <p
            style={{
              fontSize: 'clamp(15px, 2vw, 18px)',
              lineHeight: 1.5,
              color: safeAccent,
              fontWeight: 600,
              margin: '0 0 16px',
            }}
          >
            {safeTagline}
          </p>
        ) : null}

        <p
          style={{
            fontSize: 'clamp(16px, 2.4vw, 20px)',
            lineHeight: 1.6,
            color: '#334155',
            maxWidth: 680,
            margin: '0 0 32px',
          }}
        >
          {merged.blurb}
        </p>

        <a
          href={ctaHref}
          style={{
            display: 'inline-block',
            padding: '14px 28px',
            borderRadius: 10,
            background: safeAccent,
            color: 'white',
            fontWeight: 600,
            fontSize: 16,
            textDecoration: 'none',
            boxShadow: '0 4px 12px rgba(15,23,42,0.12)',
          }}
        >
          {t.cta}
        </a>

        {safeFloor !== null && safeFloor > 0 ? (
          <p style={{ marginTop: 16, fontSize: 13, color: '#475569' }}>
            <strong style={{ color: '#0f172a' }}>{safeFloor}+</strong> {t.floor_suffix}
          </p>
        ) : null}

        {safeHero ? (
          <div style={{ marginTop: 48 }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={safeHero}
              alt={merged.headline ?? 'HIR'}
              style={{ width: '100%', maxWidth: 920, borderRadius: 12, boxShadow: '0 8px 24px rgba(15,23,42,0.08)' }}
            />
          </div>
        ) : null}
      </section>

      {/* MANDATORY footer per Brand Bible reseller agreement. Do NOT remove. */}
      <footer
        data-hir-powered-by
        style={{
          borderTop: '1px solid #e2e8f0',
          padding: '20px 24px',
          textAlign: 'center',
          fontSize: 13,
          color: '#64748b',
          background: 'white',
        }}
      >
        <span>
          {t.ref_code}{' '}
          <code style={{ background: '#f1f5f9', padding: '2px 6px', borderRadius: 4 }}>
            {partner.code}
          </code>
        </span>
        {' · '}
        <a
          href="https://hirforyou.ro"
          style={{ color: '#0f172a', fontWeight: 600, textDecoration: 'none' }}
        >
          {t.powered_by}
        </a>
      </footer>
    </main>
  );
}

export async function generateMetadata({ params }: { params: { code: string } }) {
  const code = (params.code ?? '').toUpperCase();
  return {
    title: `HIRforYOU — ${code}`,
    description: 'Soluția de comenzi online pentru restaurante. 2 lei/comandă, fără abonament.',
    robots: { index: false, follow: false },
  };
}
