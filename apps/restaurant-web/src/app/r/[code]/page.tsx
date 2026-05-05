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
import { RefCookieSetter } from './ref-cookie-setter';

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
  } | null;
};

const DEFAULT_LANDING = {
  headline: 'HIR — soluția de comenzi online pentru restaurante',
  blurb: 'Plătești doar 3 RON / livrare. Fără abonament. White-label, multi-locație, cu AI care optimizează vânzările zilnic.',
  cta_url: '/migrate-from-gloriafood',
  accent_color: '#0f766e',
};

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

  // Same defense for hero_image_url.
  const rawHero = merged.hero_image_url;
  let safeHero: string | null = null;
  if (typeof rawHero === 'string' && rawHero.length > 0) {
    try {
      const u = new URL(rawHero);
      if (u.protocol === 'https:') safeHero = rawHero;
    } catch { /* skip */ }
  }

  // accent_color: only allow #RGB or #RRGGBB. Default if invalid.
  const rawAccent = merged.accent_color ?? DEFAULT_LANDING.accent_color;
  const safeAccent = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(String(rawAccent ?? ''))
    ? String(rawAccent)
    : DEFAULT_LANDING.accent_color;

  return (
    <main
      style={{
        minHeight: '100vh',
        background: `linear-gradient(135deg, ${safeAccent}10 0%, #ffffff 60%)`,
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
        color: '#1e293b',
      }}
    >
      {/* Lane T: persist the partner code in a 90-day cookie for indirect
          attribution (user visits /r/<code>, leaves, comes back via direct
          URL). The CTA URL already carries ?ref=<code> for primary attribution. */}
      <RefCookieSetter code={partner.code} />
      <section style={{ maxWidth: 920, margin: '0 auto', padding: '64px 24px' }}>
        <div style={{ marginBottom: 16, fontSize: 14, color: '#64748b' }}>
          Recomandat de <strong>{partner.name}</strong>
        </div>
        <h1
          style={{
            fontSize: 'clamp(28px, 5vw, 48px)',
            lineHeight: 1.15,
            margin: '0 0 16px',
            fontWeight: 700,
            color: '#0f172a',
          }}
        >
          {merged.headline}
        </h1>
        <p style={{ fontSize: 'clamp(16px, 2.4vw, 20px)', lineHeight: 1.6, color: '#334155', maxWidth: 680, margin: '0 0 32px' }}>
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
          Începe acum cu HIR
        </a>

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

        <footer style={{ marginTop: 64, fontSize: 13, color: '#94a3b8' }}>
          Cod referal: <code style={{ background: '#f1f5f9', padding: '2px 6px', borderRadius: 4 }}>{partner.code}</code>
          {' · '}
          <a href="https://hirforyou.ro" style={{ color: '#64748b' }}>HIR for You</a>
        </footer>
      </section>
    </main>
  );
}

export async function generateMetadata({ params }: { params: { code: string } }) {
  const code = (params.code ?? '').toUpperCase();
  return {
    title: `HIR Restaurant — ${code}`,
    description: 'Soluția de comenzi online pentru restaurante. 3 RON/livrare, fără abonament.',
    robots: { index: false, follow: false },
  };
}
