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
  if (partner.status !== 'ACTIVE') notFound();

  // Track the visit. Fire-and-forget — don't await in a way that delays
  // hydration.
  trackVisit(partner.id);

  const merged = { ...DEFAULT_LANDING, ...(partner.landing_settings ?? {}) };
  const ctaHref = (merged.cta_url ?? DEFAULT_LANDING.cta_url) + `?ref=${encodeURIComponent(code)}`;

  return (
    <main
      style={{
        minHeight: '100vh',
        background: `linear-gradient(135deg, ${merged.accent_color}10 0%, #ffffff 60%)`,
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
        color: '#1e293b',
      }}
    >
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
            background: merged.accent_color,
            color: 'white',
            fontWeight: 600,
            fontSize: 16,
            textDecoration: 'none',
            boxShadow: '0 4px 12px rgba(15,23,42,0.12)',
          }}
        >
          Începe acum cu HIR
        </a>

        {merged.hero_image_url ? (
          <div style={{ marginTop: 48 }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={merged.hero_image_url}
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
